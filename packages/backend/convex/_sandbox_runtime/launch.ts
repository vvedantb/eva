"use node";

import { requiredEnv, errorMessage } from "@vvedantb/server";
import { createHmac } from "crypto";
import { quote } from "shell-quote";
import { redactSecrets } from "@eva/shared/redactSecrets";
import { z } from "zod";
import { getAIModelProvider, normalizeAIModel } from "../validators";
import type { AIProvider } from "../validators";
import { execHandle } from "./helpers";
import {
  resolvePublicConvexCloudUrl,
  resolvePublicConvexSiteUrl,
} from "../_env/publicConvexUrls";
import { writeSandboxFile } from "./sandboxFiles";
import { streamingHeartbeatHmacMessage } from "./callbackAuth";
import { DAEMON_PID_LIVE_FN, entityDaemonPaths } from "./daemonPaths";
import { CLAUDE_CODE_VERSION } from "./claudeCliVersion";
import { CODEX_CLI_VERSION } from "./codexCliVersion";
import type { SandboxHandle } from "../_sandbox/provider";
import {
  CLAUDE_CLI_INSTALL_DIR,
  CODEX_CLI_INSTALL_DIR,
  EVA_ENV_SOURCE_CMD,
} from "../_sandbox/vercelEnvFile";
import { CALLBACK_SCRIPT } from "./callbackScript";
import { CALLBACK_SCRIPT_FINGERPRINT } from "./callbackScriptFingerprint";
import { buildLinkedReposEnv, type LinkedRepoEnvRow } from "./linkedReposEnv";

export const CLAUDE_BASE_CONFIG_DIR = "/home/eva/.claude";
export const CLAUDE_RUNTIME_CONFIG_DIR = "/tmp/claude-config";
export const CLAUDE_PERSIST_VOLUME_MOUNT_PATH = "/home/eva/.claude-persist";
export const CODEX_RUNTIME_HOME_DIR = "/tmp/codex-home";
export const CODEX_PERSIST_VOLUME_MOUNT_PATH = "/home/eva/.codex-persist";
export const OPENCODE_RUNTIME_HOME_DIR = "/tmp/opencode-home";
export const OPENCODE_PERSIST_VOLUME_MOUNT_PATH = "/home/eva/.opencode-persist";
export const CURSOR_RUNTIME_HOME_DIR = "/tmp/cursor-home";
export const CURSOR_PERSIST_VOLUME_MOUNT_PATH = "/home/eva/.cursor-persist";

const CLAUDE_INSTALL_TIMEOUT_SECONDS = 300;
const CLAUDE_FALLBACK_INSTALL_DIR = CLAUDE_CLI_INSTALL_DIR;
export const CLAUDE_FALLBACK_BIN_PATH = `${CLAUDE_FALLBACK_INSTALL_DIR}/bin/claude`;
const CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
const CLAUDE_FALLBACK_PACKAGE_ROOT = `${CLAUDE_FALLBACK_INSTALL_DIR}/lib/node_modules/${CLAUDE_CODE_PACKAGE}`;
const CODEX_INSTALL_TIMEOUT_SECONDS = 300;
const CODEX_FALLBACK_INSTALL_DIR = CODEX_CLI_INSTALL_DIR;
const CODEX_FALLBACK_BIN_PATH = `${CODEX_FALLBACK_INSTALL_DIR}/bin/codex`;
const CODEX_CLI_PACKAGE = "@openai/codex";
const CODEX_FALLBACK_PACKAGE_ROOT = `${CODEX_FALLBACK_INSTALL_DIR}/lib/node_modules/${CODEX_CLI_PACKAGE}`;
const OPENCODE_INSTALL_TIMEOUT_SECONDS = 300;
const OPENCODE_FALLBACK_INSTALL_DIR = "/tmp/opencode-cli";
const OPENCODE_FALLBACK_BIN_PATH = `${OPENCODE_FALLBACK_INSTALL_DIR}/bin/opencode`;
const OPENCODE_FALLBACK_VERSION = "1.18.16";
const EVA_TOOLING_PREP_TIMEOUT_SECONDS = 30;
const CALLBACK_READY_POLL_ATTEMPTS = 60;
const CALLBACK_READY_POLL_INTERVAL_MS = 1000;

const RUNNER_LOG_TAIL_MAX_CHARS = 2_000;

/**
 * Condenses a runner log tail before it is quoted into an error message. These
 * errors are written straight into the chat as the failed turn's assistant
 * bubble, and a retrying daemon repeats the same line dozens of times — one
 * observed failure produced a 17.8KB bubble of identical "streaming heartbeat
 * attempt N failed" lines, which is unreadable and slow to render.
 *
 * Collapses runs of identical lines into `line (xN)` and keeps the LAST
 * `RUNNER_LOG_TAIL_MAX_CHARS` characters, since the tail is where the actual
 * failure lands. Redacts before clipping so a cut cannot leave a token whose
 * prefix no longer matches.
 */
export function condenseRunnerLogTail(log: string): string {
  const collapsed: string[] = [];
  let shown: string | undefined;
  let key: string | undefined;
  let repeats = 0;
  const flush = () => {
    if (shown === undefined) return;
    collapsed.push(repeats > 1 ? `${shown} (x${repeats})` : shown);
  };
  for (const line of redactSecrets(log).split("\n")) {
    const trimmed = line.trim();
    const normalized = trimmed.replace(/\d+/g, "#");
    if (key !== undefined && normalized === key) {
      repeats += 1;
      continue;
    }
    flush();
    shown = trimmed;
    key = normalized;
    repeats = 1;
  }
  flush();
  const condensed = collapsed.join("\n").trim();
  return condensed.length > RUNNER_LOG_TAIL_MAX_CHARS
    ? `…${condensed.slice(-RUNNER_LOG_TAIL_MAX_CHARS)}`
    : condensed;
}

function computeScopedHmac(message: string): string | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update(message).digest("hex");
}

function publicConvexUrl(): string {
  return (
    resolvePublicConvexCloudUrl(process.env) ?? requiredEnv("CONVEX_CLOUD_URL")
  );
}

function resolveConvexSiteUrl(convexCloudUrl: string): string {
  return (
    resolvePublicConvexSiteUrl(process.env, convexCloudUrl) ??
    convexCloudUrl.replace(".convex.cloud", ".convex.site")
  );
}

const CLI_REGISTRY_TIMEOUT_MS = 4_000;
const CLI_VERSION_CACHE_TTL_MS = 15 * 60 * 1000;

const registryLatestSchema = z.object({ version: z.string() });

const cachedCliVersions = new Map<
  string,
  { version: string; resolvedAt: number }
>();

function isNewerVersion(candidate: string, floor: string): boolean {
  const candidateParts = candidate.split(".");
  const floorParts = floor.split(".");
  for (let index = 0; index < 3; index += 1) {
    const left = Number(candidateParts[index] ?? "0");
    const right = Number(floorParts[index] ?? "0");
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    if (left !== right) return left > right;
  }
  return false;
}

async function resolveLatestCliVersion(
  packageName: string,
  floor: string,
): Promise<string> {
  const now = Date.now();
  const cached = cachedCliVersions.get(packageName);
  if (
    cached !== undefined &&
    now - cached.resolvedAt < CLI_VERSION_CACHE_TTL_MS
  ) {
    return cached.version;
  }
  let resolved = floor;
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: AbortSignal.timeout(CLI_REGISTRY_TIMEOUT_MS) },
    );
    if (response.ok) {
      const parsed = registryLatestSchema.safeParse(await response.json());
      if (parsed.success && isNewerVersion(parsed.data.version, resolved)) {
        resolved = parsed.data.version;
      }
    }
  } catch (error) {
    console.log(
      `[sandbox][cli] ${packageName} registry lookup failed, using floor ${floor}: ${
        errorMessage(error)
      }`,
    );
  }
  cachedCliVersions.set(packageName, { version: resolved, resolvedAt: now });
  return resolved;
}

export function resolveClaudeCliVersion(): Promise<string> {
  return resolveLatestCliVersion(CLAUDE_CODE_PACKAGE, CLAUDE_CODE_VERSION);
}

export function resolveCodexCliVersion(): Promise<string> {
  return resolveLatestCliVersion(CODEX_CLI_PACKAGE, CODEX_CLI_VERSION);
}

/**
 * Makes the resolved Claude CLI available on the sandbox.
 *
 * Version-checked, not existence-checked: models are gated on the CLI's own
 * version, and a sandbox seeded before the pin moved keeps its stale global
 * `claude` for life (only a reseed upgrades the global). Session 62 on a 14 Aug
 * snapshot failed every Fable 5.1 turn with "Claude Code 2.1.232 does not
 * support this model" because the old guard only installed when `claude` was
 * missing. When neither the `claude` on PATH nor the fallback prefix holds the
 * pin, the pin is installed under the fallback prefix (user-writable; the
 * global npm root is root-owned), and the callback prefers it over a drifted
 * global — see `claudeExecutablePath` in callback-src/providers/claudeSdk.ts
 * and `pinnedCliInstallCommand` for why only the PATH copy counts.
 */
export async function ensureClaudeCliAvailable(
  sandbox: SandboxHandle,
  version: string,
): Promise<void> {
  await execHandle(
    sandbox,
    pinnedCliInstallCommand({
      binName: "claude",
      packageName: CLAUDE_CODE_PACKAGE,
      fallbackInstallDir: CLAUDE_FALLBACK_INSTALL_DIR,
      fallbackPackageRoot: CLAUDE_FALLBACK_PACKAGE_ROOT,
      version,
    }),
    CLAUDE_INSTALL_TIMEOUT_SECONDS,
  );
}

/**
 * Shell guard that installs `packageName@version` under the fallback prefix
 * unless the binary on PATH, or the fallback, is already that version.
 *
 * Checks the package behind `command -v <bin>` (`<prefix>/bin/<bin>` →
 * `<prefix>/lib/node_modules/<package>`), not every global root: the callback's
 * `resolvePinnedCliBinary` runs whatever PATH finds first, so a matching copy
 * anywhere else must not count. A `claude update` in the terminal installs into
 * the user's npm prefix, behind the image's copy on PATH; probing that root
 * skipped this install and left the agent on the image's stale CLI.
 */
export function pinnedCliInstallCommand(cli: {
  binName: string;
  packageName: string;
  fallbackInstallDir: string;
  fallbackPackageRoot: string;
  version: string;
}): string {
  const pinned = quote([cli.version]);
  return [
    `cli_version() { node -p "require(process.argv[1] + '/package.json').version" "$1" 2>/dev/null; }`,
    `bin_path="$(command -v ${quote([cli.binName])} || true)"`,
    `path_version="$([ -n "$bin_path" ] && cli_version "$(dirname "$(dirname "$bin_path")")/lib/node_modules/${cli.packageName}")"`,
    `if [ "$path_version" != ${pinned} ] && [ "$(cli_version ${quote([cli.fallbackPackageRoot])})" != ${pinned} ]; then npm install -g --prefix ${quote([cli.fallbackInstallDir])} ${cli.packageName}@${cli.version}; fi`,
  ].join("; ");
}

async function ensureCodexRuntimeAvailable(
  sandbox: SandboxHandle,
  version: string,
): Promise<void> {
  await execHandle(
    sandbox,
    pinnedCliInstallCommand({
      binName: "codex",
      packageName: CODEX_CLI_PACKAGE,
      fallbackInstallDir: CODEX_FALLBACK_INSTALL_DIR,
      fallbackPackageRoot: CODEX_FALLBACK_PACKAGE_ROOT,
      version,
    }),
    CODEX_INSTALL_TIMEOUT_SECONDS,
  );
}

async function ensureOpencodeCliAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  await execHandle(
    sandbox,
    `if ! command -v opencode >/dev/null 2>&1 && [ ! -x ${quote([OPENCODE_FALLBACK_BIN_PATH])} ]; then npm install -g --prefix ${quote([OPENCODE_FALLBACK_INSTALL_DIR])} opencode-ai@${OPENCODE_FALLBACK_VERSION}; fi`,
    OPENCODE_INSTALL_TIMEOUT_SECONDS,
  );
}

function ensureProviderCliAvailable(
  sandbox: SandboxHandle,
  provider: AIProvider,
  cliVersion: string,
): Promise<void> {
  switch (provider) {
    case "claude":
      return ensureClaudeCliAvailable(sandbox, cliVersion);
    case "codex":
      return ensureCodexRuntimeAvailable(sandbox, cliVersion);
    case "opencode":
      return ensureOpencodeCliAvailable(sandbox);
    default:
      return Promise.resolve();
  }
}

async function ensureEvaToolingAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  try {
    await execHandle(
      sandbox,
      [
        "{ [ -d /home/eva ] || { sudo mkdir -p /home/eva/.eva-snapshot-state && sudo chmod -R 777 /home/eva; } || true; }",
        "{ command -v agent-browser >/dev/null 2>&1 || sudo sh -c 'setsid nohup npm install -g agent-browser >/tmp/eva-tooling-install.log 2>&1 &' || true; }",
      ].join(" && "),
      EVA_TOOLING_PREP_TIMEOUT_SECONDS,
    );
  } catch (error) {
    console.warn(
      `[sandbox][launchScript] eva tooling prep failed on ${sandbox.id} — agent-browser / provider-SDK fallback dir may be unavailable this run:`,
      error,
    );
  }
}

function ensureSharedPnpmStore(sandbox: SandboxHandle): Promise<void> {
  const storeDir = "/home/vercel-sandbox/.local/share/pnpm";
  const homes = [
    CODEX_RUNTIME_HOME_DIR,
    OPENCODE_RUNTIME_HOME_DIR,
    CURSOR_RUNTIME_HOME_DIR,
  ];
  const perHome = homes.map(
    (home) =>
      `mkdir -p ${home} && { grep -qs '^store-dir=' ${home}/.npmrc || echo 'store-dir=${storeDir}' >> ${home}/.npmrc; } && rm -rf ${home}/.local/share/pnpm`,
  );
  return execHandle(sandbox, `${perHome.join("; ")}; true`, 30).then(() => {});
}

function runnerFlockPath(entityIdField: string, entityId: string): string {
  return `/tmp/eva-runner.${entityIdField}-${entityId}.lock`;
}

/** Uploads the bundled callback runner + fingerprint without starting a process. */
export async function uploadCallbackScriptBundle(
  sandbox: SandboxHandle,
): Promise<void> {
  await Promise.all([
    writeSandboxFile(sandbox, "/tmp/run-design.mjs", CALLBACK_SCRIPT),
    writeSandboxFile(
      sandbox,
      "/tmp/eva-callback-fp",
      CALLBACK_SCRIPT_FINGERPRINT,
    ),
  ]);
}

/** Uploads prompt and callback script to the sandbox, then launches the AI runner process. */
export async function launchScript(
  sandbox: SandboxHandle,
  prompt: string,
  completionMutation: string,
  entityIdField: string,
  convexToken: string,
  entityId: string,
  opts: {
    model?: string;
    allowedTools?: string;
    systemPrompt?: string;
    extraEnvVars?: Record<string, string>;
    claudeSessionId?: string;
    mcpToken?: string;
    mcpBaseUrl?: string;
    systemSkillsJson?: string;
    claimMutation?: string;
    openSyntheticTurnMutation?: string;
    completeSyntheticTurnMutation?: string;
    updateBackgroundAgentsMutation?: string;
    updateGoalMutation?: string;
    harnessCatalogToken?: string;
    linkedRepos?: LinkedRepoEnvRow[];
  } = {},
): Promise<void> {
  const launchStartedAt = Date.now();
  console.log(
    `[sandbox][launchScript] started entityId=${entityId} sandboxId=${sandbox.id}`,
  );
  const normalizedModel = normalizeAIModel(opts.model);
  const provider = getAIModelProvider(normalizedModel);
  const cliVersionPromise =
    provider === "claude"
      ? resolveClaudeCliVersion()
      : provider === "codex"
        ? resolveCodexCliVersion()
        : Promise.resolve(CLAUDE_CODE_VERSION);
  const providerPrep = Promise.all([
    cliVersionPromise.then((version) =>
      ensureProviderCliAvailable(sandbox, provider, version),
    ),
    ensureEvaToolingAvailable(sandbox),
    ensureSharedPnpmStore(sandbox),
  ]);
  function uploadWithTiming(
    path: string,
    content: string,
    label: string,
  ): Promise<void> {
    return writeSandboxFile(sandbox, path, content).then(() => {
      console.log(
        `[sandbox][launchScript] ${label} uploaded in ${Date.now() - launchStartedAt}ms entityId=${entityId}`,
      );
    });
  }
  const uploadTasks: Array<Promise<void>> = [
    uploadWithTiming("/tmp/design-prompt.txt", prompt, "prompt"),
    uploadWithTiming("/tmp/run-design.mjs", CALLBACK_SCRIPT, "callback script"),
    uploadWithTiming(
      "/tmp/eva-callback-fp",
      CALLBACK_SCRIPT_FINGERPRINT,
      "callback fingerprint",
    ),
  ];

  if (opts.systemSkillsJson !== undefined) {
    uploadTasks.push(
      uploadWithTiming(
        "/tmp/eva-system-skills.json",
        opts.systemSkillsJson,
        "system skills",
      ),
    );
  }

  await Promise.all([providerPrep, ...uploadTasks]);

  const resolvedCliVersion = await cliVersionPromise;
  const claudeCliVersion =
    provider === "claude" ? resolvedCliVersion : CLAUDE_CODE_VERSION;
  const codexCliVersion =
    provider === "codex" ? resolvedCliVersion : CODEX_CLI_VERSION;
  const convexUrl = publicConvexUrl();
  const streamingEntityId = opts.extraEnvVars?.STREAMING_ENTITY_ID ?? entityId;
  const streamingHmac = computeScopedHmac(
    streamingHeartbeatHmacMessage(streamingEntityId),
  );
  const envParts = [
    `CONVEX_URL=${quote([convexUrl])}`,
    `CONVEX_TOKEN=${quote([convexToken])}`,
    `ENTITY_ID=${quote([entityId])}`,
    `COMPLETION_MUTATION=${quote([completionMutation])}`,
    `ENTITY_ID_FIELD=${quote([entityIdField])}`,
    `AI_PROVIDER=${quote([provider])}`,
    `AI_MODEL=${quote([normalizedModel])}`,
    `CLAUDE_MODEL=${quote([normalizedModel])}`,
    `ALLOWED_TOOLS=${quote([opts.allowedTools ?? "Read,Glob,Grep,Skill"])}`,
    `SYSTEM_PROMPT=${quote([opts.systemPrompt ?? ""])}`,
    `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`,
    `CODEX_RUNTIME_HOME_DIR=${quote([CODEX_RUNTIME_HOME_DIR])}`,
    `CODEX_PERSIST_DIR=${quote([CODEX_PERSIST_VOLUME_MOUNT_PATH])}`,
    `CODEX_BIN_PATH=${quote([CODEX_FALLBACK_BIN_PATH])}`,
    `CODEX_CLI_PINNED_VERSION=${quote([codexCliVersion])}`,
    `CLAUDE_BIN_PATH=${quote([CLAUDE_FALLBACK_BIN_PATH])}`,
    `CLAUDE_CLI_PINNED_VERSION=${quote([claudeCliVersion])}`,
    `OPENCODE_RUNTIME_HOME_DIR=${quote([OPENCODE_RUNTIME_HOME_DIR])}`,
    `OPENCODE_PERSIST_DIR=${quote([OPENCODE_PERSIST_VOLUME_MOUNT_PATH])}`,
    `EVA_OPENCODE_BIN_PATH=${quote([OPENCODE_FALLBACK_BIN_PATH])}`,
    `CURSOR_RUNTIME_HOME_DIR=${quote([CURSOR_RUNTIME_HOME_DIR])}`,
    `CURSOR_PERSIST_DIR=${quote([CURSOR_PERSIST_VOLUME_MOUNT_PATH])}`,
  ];
  if (streamingHmac || opts.harnessCatalogToken) {
    envParts.push(
      `CONVEX_SITE_URL=${quote([resolveConvexSiteUrl(convexUrl)])}`,
    );
  }
  if (streamingHmac) {
    envParts.push(`STREAMING_HMAC=${quote([streamingHmac])}`);
  }
  if (opts.harnessCatalogToken) {
    envParts.push(
      `HARNESS_CATALOG_TOKEN=${quote([opts.harnessCatalogToken])}`,
      `HARNESS_CATALOG_SANDBOX_ID=${quote([sandbox.id])}`,
    );
  }
  if (opts.claudeSessionId) {
    envParts.push(`CLAUDE_SESSION_ID=${quote([opts.claudeSessionId])}`);
    envParts.push(`CLAUDE_BASE_CONFIG_DIR=${quote([CLAUDE_BASE_CONFIG_DIR])}`);
    envParts.push(
      `CLAUDE_RUNTIME_CONFIG_DIR=${quote([CLAUDE_RUNTIME_CONFIG_DIR])}`,
    );
    envParts.push(
      `CLAUDE_PERSIST_DIR=${quote([CLAUDE_PERSIST_VOLUME_MOUNT_PATH])}`,
    );
  }
  if (opts.claimMutation) {
    envParts.push(`CLAIM_MUTATION=${quote([opts.claimMutation])}`);
  }
  if (opts.openSyntheticTurnMutation) {
    envParts.push(
      `OPEN_SYNTHETIC_TURN_MUTATION=${quote([opts.openSyntheticTurnMutation])}`,
    );
  }
  if (opts.completeSyntheticTurnMutation) {
    envParts.push(
      `COMPLETE_SYNTHETIC_TURN_MUTATION=${quote([opts.completeSyntheticTurnMutation])}`,
    );
  }
  if (opts.updateBackgroundAgentsMutation) {
    envParts.push(
      `UPDATE_BACKGROUND_AGENTS_MUTATION=${quote([opts.updateBackgroundAgentsMutation])}`,
    );
  }
  if (opts.updateGoalMutation) {
    envParts.push(`UPDATE_GOAL_MUTATION=${quote([opts.updateGoalMutation])}`);
  }
  if (opts.extraEnvVars) {
    for (const [key, val] of Object.entries(opts.extraEnvVars)) {
      envParts.push(`${key}=${quote([val])}`);
    }
  }
  if (opts.mcpBaseUrl && opts.mcpToken) {
    envParts.push(`EVA_MCP_AUTH=${quote([opts.mcpToken])}`);
    envParts.push(`EVA_MCP_BASE_URL=${quote([opts.mcpBaseUrl])}`);
  }
  for (const [key, val] of Object.entries(
    buildLinkedReposEnv(opts.linkedRepos ?? []),
  )) {
    envParts.push(`${key}=${quote([val])}`);
  }
  envParts.push(`CALLBACK_SCRIPT_FP=${quote([CALLBACK_SCRIPT_FINGERPRINT])}`);
  const exportLines = envParts.map((part) => `export ${part}`);
  const runnerLockPath = runnerFlockPath(entityIdField, entityId);
  const runnerLaunchScript = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    EVA_ENV_SOURCE_CMD,
    "rm -f /tmp/run-design.pid /tmp/run-design.ready /tmp/eva-mcp.json",
    ...exportLines,
    'rm -f "$0"',
    "if command -v flock >/dev/null 2>&1; then",
    `  nohup flock -n -E 217 ${runnerLockPath} node /tmp/run-design.mjs >> /tmp/design.log 2>&1 &`,
    "else",
    "  nohup node /tmp/run-design.mjs >> /tmp/design.log 2>&1 &",
    "fi",
    "echo $! > /tmp/run-design.pid",
    'echo -600 | sudo -n tee "/proc/$(cat /tmp/run-design.pid)/oom_score_adj" >/dev/null 2>&1 || true',
  ].join("\n");
  await writeSandboxFile(
    sandbox,
    "/tmp/eva-launch-runner.sh",
    runnerLaunchScript,
  );
  await execHandle(
    sandbox,
    "rm -f /tmp/run-design.pid /tmp/run-design.ready /tmp/run-design.done",
    5,
  );
  // Use handle.exec (not execHandle) so cwd stays at the Vercel default — the script
  await sandbox.execDetached(
    "chmod +x /tmp/eva-launch-runner.sh && /tmp/eva-launch-runner.sh",
    { timeoutSeconds: 15 },
  );
  await waitForRunnerReady(sandbox, entityId, {
    runnerLockPath,
    daemonPaths: entityDaemonPaths(entityIdField, entityId),
    expectedDaemonOptsSig: opts.extraEnvVars?.EVA_DAEMON_OPTS,
  });
  console.log(
    `[sandbox][launchScript] runner ready in ${Date.now() - launchStartedAt}ms entityId=${entityId}`,
  );
}

async function waitForRunnerReady(
  sandbox: SandboxHandle,
  entityId: string,
  fence: {
    runnerLockPath: string;
    daemonPaths: { pid: string; opts: string };
    expectedDaemonOptsSig: string | undefined;
  },
): Promise<void> {
  for (let attempt = 0; attempt < CALLBACK_READY_POLL_ATTEMPTS; attempt++) {
    const ready = (
      await execHandle(
        sandbox,
        `test -f /tmp/run-design.ready && echo yes || echo no`,
        5,
      )
    ).trim();
    if (ready === "yes") {
      return;
    }

    const alive = (
      await execHandle(
        sandbox,
        `pid=$(cat /tmp/run-design.pid 2>/dev/null || true); if [ -z "$pid" ]; then echo pending; elif kill -0 "$pid" 2>/dev/null; then echo alive; else echo dead; fi`,
        5,
      )
    ).trim();
    if (alive === "dead") {
      const lock = (
        await execHandle(
          sandbox,
          `if ! command -v flock >/dev/null 2>&1; then echo nolock; elif flock -n ${quote([fence.runnerLockPath])} true 2>/dev/null; then echo free; else echo held; fi`,
          5,
        )
      ).trim();
      if (lock === "held" && fence.expectedDaemonOptsSig !== undefined) {
        const incumbent = (
          await execHandle(
            sandbox,
            `${DAEMON_PID_LIVE_FN}; ` +
              `if ! eva_pid_live ${quote([fence.daemonPaths.pid])}; then echo norunner; ` +
              `elif [ "$(cat ${quote([fence.daemonPaths.opts])} 2>/dev/null)" = ${quote([fence.expectedDaemonOptsSig])} ]; then echo match; ` +
              `else echo optsmismatch; fi`,
            5,
          )
        ).trim();
        if (incumbent === "match") {
          console.log(
            `[sandbox][launchScript] spawn lock held by a live daemon with matching opts — reusing it entityId=${entityId}`,
          );
          return;
        }
        console.log(
          `[sandbox][launchScript] spawn lock held but incumbent unusable (${incumbent}) entityId=${entityId}`,
        );
      }
      const log = await execHandle(
        sandbox,
        `tail -n 120 /tmp/design.log 2>/dev/null || true`,
        10,
      );
      throw new Error(
        `[sandbox][launchScript] runner died entityId=${entityId} spawnLock=${lock}: ${condenseRunnerLogTail(log)}`,
      );
    }

    await new Promise((resolve) => {
      setTimeout(resolve, CALLBACK_READY_POLL_INTERVAL_MS);
    });
  }

  const log = await execHandle(
    sandbox,
    `tail -n 120 /tmp/design.log 2>/dev/null || true`,
    10,
  );
  await execHandle(
    sandbox,
    `pid=$(cat /tmp/run-design.pid 2>/dev/null || true); if [ -n "$pid" ]; then kill "$pid" 2>/dev/null || true; fi`,
    5,
  );
  throw new Error(
    `[sandbox][launchScript] runner ready timeout entityId=${entityId}: ${condenseRunnerLogTail(log)}`,
  );
}
