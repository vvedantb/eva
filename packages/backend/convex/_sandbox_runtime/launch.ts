"use node";

import { createHmac } from "crypto";
import { quote } from "shell-quote";
import { getAIModelProvider, normalizeAIModel } from "../validators";
import type { AIProvider } from "../validators";
import { execHandle, requireEnv } from "./helpers";
import {
  resolvePublicConvexCloudUrl,
  resolvePublicConvexSiteUrl,
} from "../_env/publicConvexUrls";
import { writeSandboxFile } from "./sandboxFiles";
import { streamingHeartbeatHmacMessage } from "./callbackAuth";
import { entityDaemonPaths } from "./daemonPaths";
import { CLAUDE_CODE_VERSION } from "./claudeCliVersion";
import type { SandboxHandle } from "../_sandbox/provider";
import { CALLBACK_SCRIPT } from "./callbackScript";
import { CALLBACK_SCRIPT_FINGERPRINT } from "./callbackScriptFingerprint";

// Paths baked into the callback script env for each CLI's config directory.
// These originated as Daytona persistence-volume mount paths; the *_RUNTIME_*
// paths are still where the callback script looks regardless of whether a
// volume is mounted there, so they stay here now that Daytona volumes are gone.
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
const CLAUDE_FALLBACK_INSTALL_DIR = "/tmp/claude-cli";
export const CLAUDE_FALLBACK_BIN_PATH = `${CLAUDE_FALLBACK_INSTALL_DIR}/bin/claude`;
const CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
/** Where `npm install -g --prefix CLAUDE_FALLBACK_INSTALL_DIR` places the package. */
const CLAUDE_FALLBACK_PACKAGE_ROOT = `${CLAUDE_FALLBACK_INSTALL_DIR}/lib/node_modules/${CLAUDE_CODE_PACKAGE}`;
const CODEX_INSTALL_TIMEOUT_SECONDS = 300;
const CODEX_FALLBACK_INSTALL_DIR = "/tmp/codex-cli";
const CODEX_FALLBACK_BIN_PATH = `${CODEX_FALLBACK_INSTALL_DIR}/bin/codex`;
const OPENCODE_INSTALL_TIMEOUT_SECONDS = 300;
const OPENCODE_FALLBACK_INSTALL_DIR = "/tmp/opencode-cli";
const OPENCODE_FALLBACK_BIN_PATH = `${OPENCODE_FALLBACK_INSTALL_DIR}/bin/opencode`;
/** Mirrors OPENCODE_VERSION in snapshotActions.ts and SDK_VERSION in
 * callback-src/providers/opencodeSdk.ts — the CLI serves, the SDK is its
 * generated client, and a drifted pair breaks fresh snapshots. */
const OPENCODE_FALLBACK_VERSION = "1.18.16";
const EVA_TOOLING_PREP_TIMEOUT_SECONDS = 30;
const CALLBACK_READY_POLL_ATTEMPTS = 60;
const CALLBACK_READY_POLL_INTERVAL_MS = 1000;
const EVA_ENV_FILE = "/vercel/sandbox/.eva-env.sh";

/** Cap for a runner log tail quoted into a thrown error (and thus a chat row). */
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
 * failure lands.
 */
export function condenseRunnerLogTail(log: string): string {
  const collapsed: string[] = [];
  // `shown` is the first line of the current run (kept verbatim, so timestamps
  // and ports survive); `key` is its digit-masked form, used only to decide
  // whether the next line is a repeat of the same failure.
  let shown: string | undefined;
  let key: string | undefined;
  let repeats = 0;
  const flush = () => {
    if (shown === undefined) return;
    collapsed.push(repeats > 1 ? `${shown} (x${repeats})` : shown);
  };
  for (const line of log.split("\n")) {
    const trimmed = line.trim();
    // Compare on the message, not the timestamps/backoff figures that differ on
    // every retry of the same failure.
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

/**
 * Computes a scoped callback HMAC if the deployment encryption key is
 * available. Mirrors `computeScopedHmac` in `http.ts`, which verifies it.
 */
function computeScopedHmac(message: string): string | null {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Overrides for the URLs handed to agent sandboxes, for deployments whose own
 * `CONVEX_CLOUD_URL`/`CONVEX_SITE_URL` are not reachable from outside — e.g. a
 * local backend on 127.0.0.1 exposed through a tunnel. The built-in names are
 * reserved by Convex and cannot be overridden, hence the EVA_ pair.
 */
function publicConvexUrl(): string {
  return (
    resolvePublicConvexCloudUrl(process.env) ?? requireEnv("CONVEX_CLOUD_URL")
  );
}

/** Resolves the Convex site URL used for HTTP actions, falling back from cloud URL. */
function resolveConvexSiteUrl(convexCloudUrl: string): string {
  return (
    resolvePublicConvexSiteUrl(process.env, convexCloudUrl) ??
    convexCloudUrl.replace(".convex.cloud", ".convex.site")
  );
}

/**
 * Makes the pinned Claude CLI available on the sandbox.
 *
 * Version-checked, not existence-checked: models are gated on the CLI's own
 * version, and a sandbox seeded before the pin moved keeps its stale global
 * `claude` for life (only a reseed upgrades the global). Session 62 on a 14 Aug
 * snapshot failed every Fable 5.1 turn with "Claude Code 2.1.232 does not
 * support this model" because the old guard only installed when `claude` was
 * missing. When neither the global nor the fallback prefix holds the pin, the
 * pin is installed under the fallback prefix (user-writable; the global npm
 * root is root-owned), and the callback prefers it over a drifted global —
 * see `claudeExecutablePath` in callback-src/providers/claudeSdk.ts.
 *
 * Three roots are probed, because the seed installs with `sudo npm install -g`
 * into node's own prefix (`/vercel/runtimes/node24/lib/node_modules`) while this
 * command runs as the unprivileged sandbox user, whose `npm root -g` is a
 * per-user prefix holding only pnpm. Testing `npm root -g` alone missed the
 * seeded CLI, so every fresh sandbox reinstalled the pin (~2.5s on the launch
 * critical path) despite already having it. Mirrors `globalNpmRoots()` in
 * callback-src/providers/claudeSdk.ts.
 */
export async function ensureClaudeCliAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  const pinned = quote([CLAUDE_CODE_VERSION]);
  await execHandle(
    sandbox,
    [
      `cli_version() { node -p "require(process.argv[1] + '/package.json').version" "$1" 2>/dev/null; }`,
      // node lives at `<prefix>/bin/node`, so its global modules are at
      // `<prefix>/lib/node_modules` whatever the calling user's npm config says.
      `node_root="$(dirname "$(dirname "$(command -v node)")")/lib/node_modules"`,
      `if [ "$(cli_version "$node_root/${CLAUDE_CODE_PACKAGE}")" != ${pinned} ] && [ "$(cli_version "$(npm root -g)/${CLAUDE_CODE_PACKAGE}")" != ${pinned} ] && [ "$(cli_version ${quote([CLAUDE_FALLBACK_PACKAGE_ROOT])})" != ${pinned} ]; then npm install -g --prefix ${quote([CLAUDE_FALLBACK_INSTALL_DIR])} @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}; fi`,
    ].join("; "),
    CLAUDE_INSTALL_TIMEOUT_SECONDS,
  );
}

/** Installs the Codex runtime used by App Server and the SDK when absent. */
async function ensureCodexRuntimeAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  await execHandle(
    sandbox,
    `if ! command -v codex >/dev/null 2>&1 && [ ! -x ${quote([CODEX_FALLBACK_BIN_PATH])} ]; then npm install -g --prefix ${quote([CODEX_FALLBACK_INSTALL_DIR])} @openai/codex@0.146.0; fi`,
    CODEX_INSTALL_TIMEOUT_SECONDS,
  );
}

/**
 * Installs the opencode CLI on sandboxes whose snapshot predates it. The CLI is
 * still required after the SDK migration — it is what runs `opencode serve`,
 * the HTTP server every turn talks to. The SDK itself self-installs from the
 * callback (loadOpencodeSdk) when the snapshot lacks it.
 */
async function ensureOpencodeCliAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  await execHandle(
    sandbox,
    `if ! command -v opencode >/dev/null 2>&1 && [ ! -x ${quote([OPENCODE_FALLBACK_BIN_PATH])} ]; then npm install -g --prefix ${quote([OPENCODE_FALLBACK_INSTALL_DIR])} opencode-ai@${OPENCODE_FALLBACK_VERSION}; fi`,
    OPENCODE_INSTALL_TIMEOUT_SECONDS,
  );
}

/** Installs the CLI for the selected provider, if any, before launch. */
function ensureProviderCliAvailable(
  sandbox: SandboxHandle,
  provider: AIProvider,
): Promise<void> {
  switch (provider) {
    case "claude":
      return ensureClaudeCliAvailable(sandbox);
    case "codex":
      return ensureCodexRuntimeAvailable(sandbox);
    case "opencode":
      return ensureOpencodeCliAvailable(sandbox);
    // "cursor" needs no provisioning: @cursor/sdk is installed globally in the
    // seed snapshot, and the callback script self-installs it as a fallback on
    // old snapshots.
    default:
      return Promise.resolve();
  }
}

/**
 * Provisions the parts of eva's own tooling that only the snapshot seed run
 * installs: `/home/eva` (every provider-SDK self-install targets
 * `/home/eva/.eva-agent-sdk`) plus the agent-browser CLI, which agents invoke
 * by name off PATH — hence a global install, not the `--prefix` form the
 * provider CLIs use with an explicit *_BIN_PATH env var. Sandboxes booted from
 * the Vercel managed image (orchestrator sessions) have none of it. Both
 * halves are gated on the artifact already being present, so a snapshot boot
 * pays one probe and installs nothing.
 *
 * The npm install runs detached: a synchronous install once held the launch's
 * providerPrep gate until the provider SIGTERM-killed it at the exec timeout,
 * which surfaced in chat as "Sandbox command failed with exit code 143".
 * agent-browser availability is eventually-consistent instead — a session
 * without browser tooling still chats and edits code. agentation-mcp is
 * deliberately NOT installed here: it exists for the preview annotation
 * widget (which image-booted orchestrator sandboxes never serve) and its
 * better-sqlite3 build needs gcc/make, which the managed image lacks — that
 * compile is what blew the old synchronous install past its timeout.
 *
 * Nothing in here may throw: losing the SDK-fallback directory or the browser
 * CLI degrades a launch, but killing the chat turn is strictly worse.
 */
async function ensureEvaToolingAvailable(
  sandbox: SandboxHandle,
): Promise<void> {
  try {
    await execHandle(
      sandbox,
      // Each half is its own brace group and best-effort (`|| true`): `&&`/`||`
      // are left-associative at equal precedence, so a flat chain would run
      // the install after a failed mkdir.
      [
        // Same paths and permissions the seed run creates (snapshotActions.ts).
        "{ [ -d /home/eva ] || { sudo mkdir -p /home/eva/sandbox-config /home/eva/.eva-snapshot-state && sudo chmod -R 777 /home/eva; } || true; }",
        // Detached via setsid+nohup so the exec returns immediately and the
        // install survives it; the log file is the debugging breadcrumb.
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

/**
 * Points pnpm at the sandbox user's store for shells whose HOME is an agent
 * runtime dir. Cursor's agent runs its shell with HOME=/tmp/cursor-home, so a
 * pnpm install there silently builds a second multi-GB store; the per-home
 * .npmrc makes every home resolve the same store. Existing duplicate stores
 * are deleted — installed node_modules keep their content via hard links.
 */
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

/** Per-entity spawn lock the runner holds for its lifetime (see launchScript). */
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
    /** Read-only turn: each provider SDK translates this into its own option. */
    noWrites?: boolean;
    systemPrompt?: string;
    extraEnvVars?: Record<string, string>;
    claudeSessionId?: string;
    mcpToken?: string;
    mcpBaseUrl?: string;
    /** Serialized installed system-skill stubs; see `systemSkills.ts` in the callback. */
    systemSkillsJson?: string;
    claimMutation?: string;
    openSyntheticTurnMutation?: string;
    completeSyntheticTurnMutation?: string;
    updateBackgroundAgentsMutation?: string;
    harnessCatalogToken?: string;
  } = {},
): Promise<void> {
  const launchStartedAt = Date.now();
  console.log(
    `[sandbox][launchScript] started entityId=${entityId} sandboxId=${sandbox.id}`,
  );
  const normalizedModel = normalizeAIModel(opts.model);
  const provider = getAIModelProvider(normalizedModel);
  const providerPrep = Promise.all([
    ensureProviderCliAvailable(sandbox, provider),
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

  // Written on every launch, empty list included: the file persists on a reused
  // sandbox, so an unconditional write is what lets the callback prune stubs
  // for skills that have since been uninstalled.
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
    // Claude Code backgrounds Agent/Bash by default; Eva's turn ends on the
    // SDK `result` event, so a backgrounded sub-agent can never report back.
    // Force synchronous tools so sub-agent work stays inside the same turn.
    `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`,
    `CODEX_RUNTIME_HOME_DIR=${quote([CODEX_RUNTIME_HOME_DIR])}`,
    `CODEX_PERSIST_DIR=${quote([CODEX_PERSIST_VOLUME_MOUNT_PATH])}`,
    `CODEX_BIN_PATH=${quote([CODEX_FALLBACK_BIN_PATH])}`,
    `CLAUDE_BIN_PATH=${quote([CLAUDE_FALLBACK_BIN_PATH])}`,
    // Lets the callback tell a drifted global `claude` from the pinned one.
    `CLAUDE_CLI_PINNED_VERSION=${quote([CLAUDE_CODE_VERSION])}`,
    `OPENCODE_RUNTIME_HOME_DIR=${quote([OPENCODE_RUNTIME_HOME_DIR])}`,
    `OPENCODE_PERSIST_DIR=${quote([OPENCODE_PERSIST_VOLUME_MOUNT_PATH])}`,
    `EVA_OPENCODE_BIN_PATH=${quote([OPENCODE_FALLBACK_BIN_PATH])}`,
    `CURSOR_RUNTIME_HOME_DIR=${quote([CURSOR_RUNTIME_HOME_DIR])}`,
    `CURSOR_PERSIST_DIR=${quote([CURSOR_PERSIST_VOLUME_MOUNT_PATH])}`,
  ];
  // Callback credentials use HTTP routes on the Convex site deployment.
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
  // One provider-agnostic read-only signal. Deliberately not derived from
  // ALLOWED_TOOLS: that list is Claude's tool vocabulary, and teaching Cursor,
  // Codex and OpenCode to parse Claude tool names would put four translations
  // of the same decision in four SDK adapters. Each adapter reads this flag and
  // applies its own restriction instead.
  if (opts.noWrites) {
    envParts.push("EVA_NO_WRITES=1");
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
  if (opts.extraEnvVars) {
    for (const [key, val] of Object.entries(opts.extraEnvVars)) {
      envParts.push(`${key}=${quote([val])}`);
    }
  }
  // Reserved Eva values are appended after repo/user env so they cannot be
  // shadowed. The callback consumes and removes them before agent tools spawn.
  if (opts.mcpBaseUrl && opts.mcpToken) {
    envParts.push(`EVA_MCP_AUTH=${quote([opts.mcpToken])}`);
    envParts.push(`EVA_MCP_BASE_URL=${quote([opts.mcpBaseUrl])}`);
  }
  envParts.push(`CALLBACK_SCRIPT_FP=${quote([CALLBACK_SCRIPT_FINGERPRINT])}`);
  const exportLines = envParts.map((part) => `export ${part}`);
  // Kernel-enforced single-runner-per-entity: spawn under an exclusive flock
  // held for the runner's lifetime (flock(1) execs node, so the lock fd rides
  // the runner process itself and the kernel releases it on death — no stale
  // pid or pid-reuse races). Concurrent launches for the same entity lose the
  // lock instantly (exit 217) instead of booting a duplicate daemon, and
  // waitForRunnerReady decides whether the lock holder is the runner this
  // launch wanted; the daemon's own pidfile fence remains as fallback for
  // images without flock(1), where this fails open.
  const runnerLockPath = runnerFlockPath(entityIdField, entityId);
  const runnerLaunchScript = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE}`,
    "rm -f /tmp/run-design.pid /tmp/run-design.ready /tmp/eva-mcp.json",
    ...exportLines,
    // The script carries per-launch credentials, so unlink it once this shell
    // has loaded the exports and before the long-lived callback is spawned.
    'rm -f "$0"',
    "if command -v flock >/dev/null 2>&1; then",
    `  nohup flock -n -E 217 ${runnerLockPath} node /tmp/run-design.mjs >> /tmp/design.log 2>&1 &`,
    "else",
    "  nohup node /tmp/run-design.mjs >> /tmp/design.log 2>&1 &",
    "fi",
    "echo $! > /tmp/run-design.pid",
    // Privileged half of the OOM bias: the callback lowers its own
    // oom_score_adj to -600 (callback-src/index.ts) but lowering needs root,
    // so that write no-ops unprivileged — observed in prod as the callback
    // dying silently under memory pressure while dev servers survived. Lower
    // it here via sudo instead. The opencode server subtree is re-raised to
    // 300 at spawn (callback-src/providers/opencodeServer.ts) — the only agent
    // process the callback still spawns — so the kernel kill order becomes:
    // dev servers and agent work first (both recover — preview self-heal and
    // turn error reporting), the heartbeat/reporting callback last. Fail open
    // on images without passwordless sudo.
    'echo -600 | sudo -n tee "/proc/$(cat /tmp/run-design.pid)/oom_score_adj" >/dev/null 2>&1 || true',
  ].join("\n");
  await writeSandboxFile(
    sandbox,
    "/tmp/eva-launch-runner.sh",
    runnerLaunchScript,
  );
  // Clear the previous runner's markers synchronously first. The detached
  // launcher removes them too, but execDetached returns before the script runs,
  // so the first ready poll could otherwise accept a dead predecessor's marker
  // (observed in prod: a relaunch that lost the spawn flock with exit 217
  // reported "runner ready" in 827ms, then no daemon ever polled
  // claimPendingTurn and the session hung on "Working…").
  await execHandle(
    sandbox,
    "rm -f /tmp/run-design.pid /tmp/run-design.ready /tmp/run-design.done",
    5,
  );
  // Use the provider-native detached path; waitForRunnerReady confirms the
  // backgrounded runner actually started.
  // Use handle.exec (not execHandle) so cwd stays at the Vercel default — the script
  await sandbox.execDetached(
    "chmod +x /tmp/eva-launch-runner.sh && /tmp/eva-launch-runner.sh",
    { timeoutSeconds: 15 },
  );
  await waitForRunnerReady(sandbox, entityId, {
    runnerLockPath,
    daemonPaths: entityDaemonPaths(entityIdField, entityId),
    // Only a daemon launch can be satisfied by an incumbent runner, and only
    // one whose opts signature matches (see waitForRunnerReady).
    expectedDaemonOptsSig: opts.extraEnvVars?.EVA_DAEMON_OPTS,
  });
  console.log(
    `[sandbox][launchScript] runner ready in ${Date.now() - launchStartedAt}ms entityId=${entityId}`,
  );
}

/** Polls for /tmp/run-design.ready after a detached runner launch. */
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
      // A loser of the spawn flock exits immediately, before writing the ready
      // file. A held lock alone is NOT success: the holder can be a stale
      // subtree fd (children inherit the lock fd), a daemon with different
      // model/tools than this launch asked for, or — for a one-shot turn — a
      // warm daemon that will never run this launch's prompt. Only accept it
      // when a live daemon owns the entity pidfile with our exact opts sig.
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
            `pid=$(cat ${quote([fence.daemonPaths.pid])} 2>/dev/null || true); ` +
              `if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then echo norunner; ` +
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
