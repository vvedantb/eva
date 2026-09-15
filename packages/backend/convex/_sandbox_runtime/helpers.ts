"use node";
import { createHash, randomBytes } from "crypto";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  resolveProviderAccountCredentials,
  resolveSandboxCredentials,
  resolveSandboxCredentialsOnly,
} from "../envVarResolver";
import type { SandboxClient, SandboxHandle } from "../_sandbox/provider";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
} from "./sandboxErrors";
import { writeSandboxFile } from "./sandboxFiles";
import { getSandboxClient } from "../_sandbox/factory";
import { launchScript } from "./launch";
import { ensureSwapFile } from "./swap";
import { buildStubMarkdown, SYSTEM_SKILLS } from "../_systemSkills/registry";
import { getAIModelProvider, normalizeAIModel } from "../validators";

export const WORKSPACE_DIR = "/tmp/repo";
export const LEGACY_WORKSPACE_DIR = "/workspace/repo";

/** Kills prior agent runners without matching the current shell wrapper. */
export const KILL_PRIOR_AGENT_PROCESSES_CMD =
  'pid=$(cat /tmp/run-design.pid 2>/dev/null || true); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then comm=$(cat "/proc/$pid/comm" 2>/dev/null || true); cmdline=$(tr "\\0" " " < "/proc/$pid/cmdline" 2>/dev/null || true); if [ "$comm" = "node" ]; then case "$cmdline" in *"/tmp/run-design.mjs"*) kill "$pid" 2>/dev/null || true;; esac; fi; fi; ' +
  "pkill -x claude 2>/dev/null || true; " +
  "pkill -x claude-code 2>/dev/null || true; " +
  "pkill -x codex 2>/dev/null || true; " +
  // Only legacy `opencode run` turns, never `opencode serve`: since the SDK
  // migration the long-lived server is shared across turns and killing it here
  // would force a cold start (and a fresh port bind) on every single launch.
  // Bracketing keeps the regex from matching this command's own `bash -lc`
  // wrapper, whose cmdline contains the pattern text — without it, pkill
  // SIGTERMs the wrapping shell and the exec dies with exit 143 before
  // reaching `true`.
  "pkill -f '[o]pencode run' 2>/dev/null || true; " +
  "pkill -x cursor-agent 2>/dev/null || true; " +
  "true";

/** Config file shape returned by getConfigFilesForSnapshot. */
export type SandboxConfigFile = {
  fileName: string;
  chunkUrls: Array<string | null>;
};

/**
 * Filters config files to those with all chunk URLs available.
 * Skips any file with a missing chunk URL — concatenating partial chunks would corrupt the file.
 */
export function filterDownloadableConfigFiles(
  files: SandboxConfigFile[],
): Array<{ fileName: string; chunkUrls: string[] }> {
  const result: Array<{ fileName: string; chunkUrls: string[] }> = [];
  for (const f of files) {
    if (f.chunkUrls.length === 0) continue;
    if (f.chunkUrls.some((u) => u === null)) continue;
    const validUrls = f.chunkUrls.filter((u): u is string => u !== null);
    result.push({ fileName: f.fileName, chunkUrls: validUrls });
  }
  return result;
}

/**
 * `--http1.1` is deliberate: multi-hundred-megabyte chunks over HTTP/2 die
 * partway through with `curl: (92) stream not closed cleanly: INTERNAL_ERROR`,
 * which `--retry` does not cover because it is a protocol error rather than a
 * transient HTTP status. HTTP/1.1 has no stream layer to fail.
 */
const CONFIG_FILE_CURL_OPTS = "-fSL --http1.1 --retry 5 --retry-delay 5";

/**
 * Builds shell commands to download a config file. Single-chunk files use a
 * straight `curl -o`. Multi-chunk files download each chunk to /tmp, concatenate
 * with `cat` into the destination, then remove the chunk temp files.
 * `destDir` is optional; when omitted, files land in the caller's cwd.
 */
export function buildConfigFileDownloadCommands(
  file: {
    fileName: string;
    chunkUrls: string[];
  },
  destDir?: string,
): string[] {
  const destPath = destDir
    ? `${destDir.replace(/\/$/, "")}/${file.fileName}`
    : file.fileName;
  if (file.chunkUrls.length === 1) {
    return [
      `curl ${CONFIG_FILE_CURL_OPTS} -o '${destPath}' '${file.chunkUrls[0]}'`,
    ];
  }
  const downloadCmds = file.chunkUrls.map(
    (url, i) =>
      `curl ${CONFIG_FILE_CURL_OPTS} -o '/tmp/${file.fileName}.chunk-${i}' '${url}'`,
  );
  const chunkPaths = file.chunkUrls
    .map((_, i) => `'/tmp/${file.fileName}.chunk-${i}'`)
    .join(" ");
  return [
    ...downloadCmds,
    `cat ${chunkPaths} > '${destPath}'`,
    `rm ${chunkPaths}`,
  ];
}

/** Returns a shell expression that resolves to the active workspace directory. */
export function workspaceDirShell(): string {
  return `$(if [ -d ${WORKSPACE_DIR} ]; then printf %s ${WORKSPACE_DIR}; elif [ -d ${LEGACY_WORKSPACE_DIR} ]; then printf %s ${LEGACY_WORKSPACE_DIR}; else printf %s ${WORKSPACE_DIR}; fi)`;
}
export const DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS = 60;
export const SNAPSHOT_SANDBOX_READY_TIMEOUT_SECONDS = 30;
// Restoring an archived sandbox's filesystem can take much longer than a
// stopped→started fast resume. The 60s default is fine for the fast-resume
// case, but trips a noisy timeout on archived thaws.
export const ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS = 600;
/**
 * Bound for an explicit resume attempt when the sandbox/snapshot may be gone.
 * Healthy Vercel resumes take seconds; waiting the full archived 600s then
 * hard-failing is worse than falling through to a fresh create.
 */
export const RESUME_READY_TIMEOUT_SECONDS = 180;

const EXEC_CLIENT_TIMEOUT_BUFFER_MS = 15_000;

/** Runs a command on a {@link SandboxHandle} and returns stdout, throwing on a non-zero exit. */
export async function execHandle(
  handle: SandboxHandle,
  cmd: string,
  timeout = 30,
  cwd = WORKSPACE_DIR,
): Promise<string> {
  const clientTimeoutMs = timeout * 1000 + EXEC_CLIENT_TIMEOUT_BUFFER_MS;
  const resp = await withTimeout(
    handle.exec(cmd, { cwd, timeoutSeconds: timeout }),
    clientTimeoutMs,
    `exec (${timeout}s)`,
    // Typed: a client-side timeout means the VM never answered — a
    // dead-sandbox signal for isSandboxUnresponsiveError, unlike a command
    // that ran and failed.
    (message) => new SandboxExecTimeoutError(message),
  );
  if (resp.exitCode !== 0) {
    const output = resp.output?.trim() ?? "";
    // The command prefix is the only clue when the provider discards output on
    // a kill (e.g. exit 143 = SIGTERM at timeout) — without it the failing exec
    // is unidentifiable in logs.
    const cmdHint = `cmd=${JSON.stringify(cmd.slice(0, 80))}`;
    // Typed, not a bare Error: the sandbox answered, so it is alive. The type
    // is what stops its output (`relation "X" does not exist`) from ever being
    // read as "the sandbox is gone". See sandboxErrors.ts.
    throw new SandboxCommandFailedError(
      output
        ? `Sandbox command failed (exit ${resp.exitCode}): ${output}`
        : `Sandbox command failed with exit code ${resp.exitCode} (${cmdHint})`,
      { exitCode: resp.exitCode, output },
    );
  }
  return resp.output;
}

/**
 * Ensures the Docker daemon is running inside the sandbox.
 *
 * dockerd is launched as a backgrounded process (not a system service), so it
 * does not survive sandbox auto-stop/resume. This helper is idempotent:
 *   - If `docker info` already succeeds, it's a no-op.
 *   - Otherwise, it cleans up stale sockets/containerd remnants and starts dockerd.
 *
 * Returns whether `docker info` succeeds after the attempt. Callers that need
 * Docker (e.g. seeded Supabase restore) should skip their work when this is false.
 */
export async function ensureDockerDaemon(
  sandbox: SandboxHandle,
): Promise<boolean> {
  try {
    await execHandle(sandbox, "docker info >/dev/null 2>&1", 5);
    console.log(
      `[sandbox] ensureDockerDaemon: Docker daemon already running on ${sandbox.id}`,
    );
    return true;
  } catch {
    // Not running (or docker not installed) — try to start it below.
  }

  // Prefer the shared bootstrap first. On Vercel resume the older Daytona-style
  // restart below often fails (wasting ~1s) before this same bootstrap succeeds.
  if (await bootstrapVercelDocker(sandbox)) {
    return true;
  }

  try {
    // Cleanup before restart: kill any half-alive dockerd/containerd, then
    // remove their pidfiles AND sockets. After sandbox auto-stop/resume, both
    // pidfiles survive but their PIDs map to unrelated processes in the new
    // boot — dockerd/containerd refuse to start while a pidfile claims a
    // running peer, so we must delete them.
    await execHandle(
      sandbox,
      [
        "command -v docker >/dev/null 2>&1 || sudo dnf install -y docker 2>/dev/null || true",
        "command -v docker >/dev/null 2>&1 || exit 1",
        "sudo pkill -9 containerd 2>/dev/null",
        "sudo pkill -9 dockerd 2>/dev/null",
        "sleep 1",
        "sudo rm -f /var/run/docker.pid /var/run/docker.sock /run/docker/containerd/containerd.pid /run/docker/containerd/containerd.sock /run/docker/containerd/containerd.sock.ttrpc /run/docker/containerd/containerd-debug.sock 2>/dev/null",
        "sudo systemctl start docker 2>/dev/null || true",
        "sudo setsid dockerd </dev/null >/tmp/dockerd.log 2>&1 &",
        "for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done",
        "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true",
        "docker info >/dev/null 2>&1",
      ].join("; "),
      90,
    );
    console.log(
      `[sandbox] ensureDockerDaemon: Docker daemon started on ${sandbox.id}`,
    );
    return true;
  } catch {
    console.log(
      `[sandbox] ensureDockerDaemon: Docker not available on ${sandbox.id} (old snapshot or not installed)`,
    );
  }

  return false;
}

/**
 * Vercel-specific dockerd bootstrap. Fresh/restored Vercel sandboxes ship docker
 * from the seeded snapshot but never auto-start dockerd — mirrors the seed-run
 * docker-bootstrap stage in snapshotActions.ts.
 */
export async function bootstrapVercelDocker(
  sandbox: SandboxHandle,
): Promise<boolean> {
  try {
    await execHandle(sandbox, "docker info >/dev/null 2>&1", 5);
    return true;
  } catch {
    // Not running — bootstrap below.
  }

  const script = [
    "set -e",
    'echo "bootstrap-docker:start"',
    "command -v docker >/dev/null 2>&1 || sudo dnf install -y docker",
    "command -v docker >/dev/null 2>&1 || { echo \"bootstrap-docker:no-binary\"; exit 1; }",
    "sudo pkill -9 dockerd 2>/dev/null || true",
    "sudo pkill -9 containerd 2>/dev/null || true",
    "sudo rm -f /var/run/docker.pid /var/run/docker.sock /run/docker/containerd/containerd.pid /run/docker/containerd/containerd.sock /run/docker/containerd/containerd.sock.ttrpc /run/docker/containerd/containerd-debug.sock 2>/dev/null || true",
    "sudo systemctl start docker 2>/dev/null || true",
    "sudo setsid dockerd </dev/null >/tmp/dockerd.log 2>&1 &",
    "for i in $(seq 1 90); do",
    "  docker info >/dev/null 2>&1 && break",
    "  sleep 1",
    "done",
    "sudo chmod 666 /var/run/docker.sock 2>/dev/null || true",
    "docker info >/dev/null 2>&1 || { tail -30 /tmp/dockerd.log 2>/dev/null || true; exit 1; }",
    'echo "bootstrap-docker:ok"',
  ].join("\n");

  try {
    await writeSandboxFile(sandbox, "/tmp/bootstrap-docker.sh", script);
    await execHandle(
      sandbox,
      "chmod +x /tmp/bootstrap-docker.sh && bash /tmp/bootstrap-docker.sh",
      180,
    );
    console.log(
      `[sandbox] bootstrapVercelDocker: Docker daemon started on ${sandbox.id}`,
    );
    return true;
  } catch (error) {
    console.log(
      `[sandbox] bootstrapVercelDocker failed on ${sandbox.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Ensures a sandbox is running, starting it if the initial health check fails.
 *
 * If the sandbox is archived (or already mid-thaw), `sandbox.start()` needs the
 * extended `ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS` because restoring an
 * archived sandbox's filesystem can take much longer than a fast resume. The
 * optional `onRestoring`
 * callback fires once that state is detected so callers can surface a more
 * useful progress label instead of the generic "Resuming sandbox...".
 */
export async function ensureSandboxRunning(
  sandbox: SandboxHandle,
  options: {
    timeoutSeconds?: number;
    onRestoring?: () => Promise<void>;
    /**
     * When true, skip the per-boot bootstrap (swap + dockerd) — either the
     * caller runs it itself after unlocking the UI (session reuse early-ready),
     * or the sandbox runs no workload at all (snapshot retention start/stop).
     */
    skipDocker?: boolean;
    /**
     * When true, skip the post-start `echo 1` exec probe. start() already
     * verifies the provider reports the session running; the first REAL exec
     * pays the same warmup the probe would, so on latency-sensitive paths
     * (session resume early-ready) the probe only delays the UI unlock —
     * observed ~14s on Vercel resumes. Callers that follow up with their own
     * commands (git checkout, services) get equivalent failure surfacing.
     */
    skipExecProbe?: boolean;
    /**
     * When true (explicit user-initiated starts), a Vercel stop still in
     * flight is waited out and the sandbox resumed from the fresh snapshot,
     * instead of the start being refused. Leave unset on background paths
     * (prewarm, watchdog) so they cannot resurrect a just-stopped sandbox.
     */
    resumeAfterStop?: boolean;
  } = {},
): Promise<void> {
  const defaultTimeout =
    options.timeoutSeconds ?? DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS;
  const startedAt = Date.now();

  // Refresh first. On a stopped Vercel sandbox, probing with exec waits ~20s for
  // the SDK's auto-resume path to time out before we ever call start() — skip
  // that probe when state already says we need a resume.
  let knownState: string | null = null;
  try {
    await sandbox.refresh();
    knownState = sandbox.state;
  } catch (refreshErr) {
    console.log(
      `[sandbox] ensureSandboxRunning: initial refresh failed (${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}); falling back to exec probe`,
    );
  }

  const needsStart =
    knownState !== null && knownState !== "running" && knownState !== "unknown";

  if (!needsStart) {
    try {
      console.log(
        `[sandbox] ensureSandboxRunning: checking if sandbox ${sandbox.id} is running...`,
      );
      await execHandle(sandbox, "echo 1", 5);
      console.log(
        `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} already running (${Date.now() - startedAt}ms)`,
      );
      if (!options.skipDocker) {
        await ensureSwapFile(sandbox);
        await ensureDockerDaemon(sandbox);
      }
      return;
    } catch (e) {
      console.log(
        `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} not running, starting... (check took ${Date.now() - startedAt}ms, error: ${e instanceof Error ? e.message : String(e)})`,
      );
    }
  } else {
    console.log(
      `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} state=${knownState}, starting without exec probe`,
    );
  }

  let startTimeout = defaultTimeout;
  const state = knownState ?? sandbox.state;
  if (state === "archived" || state === "restoring") {
    startTimeout = Math.max(
      startTimeout,
      ARCHIVED_SANDBOX_READY_TIMEOUT_SECONDS,
    );
    console.log(
      `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} is ${state}, extending start timeout to ${startTimeout}s`,
    );
    if (options.onRestoring) await options.onRestoring();
  } else if (
    (state === "stopped" || state === "starting") &&
    options.onRestoring
  ) {
    // Vercel maps stopped→stopped (not archived). Surface progress while
    // start() waits on the first exec that resumes the snapshot.
    console.log(
      `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} is ${state}, waiting for resume`,
    );
    await options.onRestoring();
  }

  const startStartedAt = Date.now();
  await sandbox.start(startTimeout, {
    resumeAfterStop: options.resumeAfterStop,
  });
  console.log(
    `[sandbox] ensureSandboxRunning: sandbox.start() completed in ${Date.now() - startStartedAt}ms`,
  );
  if (!options.skipExecProbe) {
    await execHandle(sandbox, "echo 1", 5);
  }
  console.log(
    `[sandbox] ensureSandboxRunning: sandbox ${sandbox.id} now running (total ${Date.now() - startedAt}ms${options.skipExecProbe ? ", exec probe skipped" : ""})`,
  );

  // Neither swap nor dockerd runs as a system service, so both are lost on
  // auto-stop/resume. Re-provision on every ensureSandboxRunning call unless
  // the caller wants to unlock the UI first (session reuse early-ready).
  // Swap goes first: it is what keeps the next memory spike from OOM-killing.
  if (!options.skipDocker) {
    await ensureSwapFile(sandbox);
    await ensureDockerDaemon(sandbox);
  }
}

/**
 * One-shot recovery for a VM the provider still reports `running` but that can
 * no longer run commands — exit 137 on a trivial exec, or execs that never
 * answer (OOM meltdown / dead guest agent; see isSandboxUnresponsiveError).
 * {@link ensureSandboxRunning} cannot fix this: start() no-ops while the
 * provider says running. The only way back is a full stop (which snapshots the
 * disk) followed by a resume, which also re-provisions swap so the next memory
 * spike has headroom.
 *
 * Refuses to touch a sandbox that is not currently `running`: a stopped or
 * stopping VM was stopped on purpose, and resuming it here would resurrect a
 * sandbox the user just stopped. `resumeAfterStop` is safe on the start
 * because the stop being waited out is the one this recovery itself issued.
 */
export async function restartUnresponsiveSandbox(
  sandbox: SandboxHandle,
  options: { timeoutSeconds?: number } = {},
): Promise<void> {
  await sandbox.refresh();
  if (sandbox.state !== "running") {
    throw new Error(
      `restartUnresponsiveSandbox: sandbox ${sandbox.id} is ${sandbox.state}, not running — refusing stop+resume`,
    );
  }
  console.warn(
    `[sandbox] restartUnresponsiveSandbox: stop+resume for unresponsive sandbox ${sandbox.id}`,
  );
  await sandbox.stop();
  await ensureSandboxRunning(sandbox, {
    timeoutSeconds: options.timeoutSeconds ?? RESUME_READY_TIMEOUT_SECONDS,
    resumeAfterStop: true,
  });
}

/** Returns the value of a required environment variable, throwing if missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Returns a promise that resolves after the specified milliseconds. */
export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const WARMING_SANDBOX_READY_TIMEOUT_SECONDS = 60;

/** Races a promise against a timeout, throwing if the timeout expires first. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  makeError: (message: string) => Error = (message) => new Error(message),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(makeError(`Sandbox ${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Extracts the message from an error, returning a fallback if not an Error instance. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.message.trim().length > 0) return error.message;
    // Some errors carry an empty message (e.g. Node's AggregateError from a
    // failed network call). Returning "" verbatim left blank errorDetail on
    // sandboxStartupWarning messages — recover what we can from name/errors/cause.
    const parts: string[] = [];
    if (error.name && error.name !== "Error") parts.push(error.name);
    if (error instanceof AggregateError) {
      const inner = error.errors
        .map((e) => (e instanceof Error ? e.message || e.name : String(e)))
        .filter((m) => m.length > 0);
      if (inner.length > 0) parts.push(inner.join("; "));
    }
    if (error.cause !== undefined) {
      const cause = error.cause;
      const causeText =
        cause instanceof Error ? cause.message || cause.name : String(cause);
      if (causeText.length > 0) parts.push(`cause: ${causeText}`);
    }
    return parts.length > 0 ? parts.join(": ") : fallback;
  }
  return fallback;
}

/**
 * Cheap client-only resolve for resume/reuse. Does not decrypt the full env map
 * or load snapshot metadata — those are only needed on the create path.
 */
export async function resolveSandboxClientOnly(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
): Promise<SandboxClient> {
  const startedAt = Date.now();
  const credentials = await resolveSandboxCredentialsOnly(ctx, repoId);
  const client = getSandboxClient(credentials);
  console.log(
    `[sandbox] resolveSandboxClientOnly repoId=${repoId} kind=${client.kind} elapsed=${Date.now() - startedAt}ms`,
  );
  return client;
}

/**
 * Vercel-managed universal image: Ubuntu with Node 24, git, ripgrep and the
 * claude-code / codex / opencode CLIs, patched nightly. The orchestrator boots
 * from it so the master session never waits on (or drifts with) a per-repo
 * snapshot build.
 */
export const ORCHESTRATOR_SANDBOX_IMAGE = "vercel/sandbox/universal:latest";

/** Resolves the provider client, sandbox env vars, and snapshot name for a repo. */
export async function resolveSandboxContext(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  opts?: {
    /** Orchestrator sessions boot from the managed image, not a repo snapshot. */
    isOrchestrator?: boolean;
  },
): Promise<{
  client: SandboxClient;
  sandboxEnvVars: Record<string, string>;
  snapshotName: string | undefined;
  image: string | undefined;
}> {
  const startedAt = Date.now();
  const { credentials, sandboxEnvVars } = await resolveSandboxCredentials(
    ctx,
    repoId,
  );
  const client = getSandboxClient(credentials);
  const isOrchestrator = opts?.isOrchestrator === true;
  // Snapshot lookup is skipped entirely for the orchestrator: the image boot
  // ignores it, and the query would only add latency to the master's start.
  const repoSnapshot = isOrchestrator
    ? null
    : await ctx.runQuery(internal.repoSnapshots.getRepoSnapshotName, {
        repoId,
      });
  const snapshotName = repoSnapshot?.snapshotName;
  console.log(
    `[sandbox] resolveSandboxContext repoId=${repoId} kind=${client.kind} orchestrator=${isOrchestrator} elapsed=${Date.now() - startedAt}ms`,
  );
  return {
    client,
    sandboxEnvVars: { ...sandboxEnvVars, REPO_ID: repoId },
    snapshotName,
    image: isOrchestrator ? ORCHESTRATOR_SANDBOX_IMAGE : undefined,
  };
}

/** Resolves the repo's sandbox provider and returns a {@link SandboxHandle} for the sandbox. */
export async function getSandboxHandle(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<SandboxHandle> {
  const { credentials } = await resolveSandboxCredentials(ctx, repoId);
  return getSandboxClient(credentials).get(sandboxId);
}

/** Signs sandbox and MCP tokens, then launches the AI agent script on the sandbox. */
export async function signAndLaunchScript(
  ctx: GenericActionCtx<DataModel>,
  sandbox: SandboxHandle,
  userId: Id<"users">,
  prompt: string,
  completionMutation: string,
  entityIdField: string,
  entityId: string,
  repoId: Id<"githubRepos">,
  opts: {
    model?: string;
    allowedTools?: string;
    /** Read-only turn: each provider SDK translates this into its own option. */
    noWrites?: boolean;
    systemPrompt?: string;
    extraEnvVars?: Record<string, string>;
    claudeSessionId?: string;
    enableMcp?: boolean;
    // When set, the entity owner's provider account credentials are decrypted
    // and layered over `extraEnvVars`, overriding the shared team credential.
    // Resolved here — the single launch choke point — so every caller only
    // threads the id. Ownership is checked against credentialOwnerUserId
    // (entity createdBy), not the launcher `userId` (MCP/auth).
    providerAccountId?: Id<"userProviderAccounts">;
    /** Entity owner (`createdBy`); defaults to `userId` when omitted. */
    credentialOwnerUserId?: Id<"users">;
    claimMutation?: string;
    openSyntheticTurnMutation?: string;
    completeSyntheticTurnMutation?: string;
    updateBackgroundAgentsMutation?: string;
  } = {},
): Promise<void> {
  const launchStartedAt = Date.now();
  console.log(
    `[sandbox][launch] signAndLaunchScript started entityId=${entityId} mutation=${completionMutation} repoId=${repoId} sandboxId=${sandbox.id}`,
  );

  // Layer the selected owner account's credentials last so they win over the
  // team credential baked into the sandbox env. Explicit selections fail
  // closed if they are unavailable or do not match the model.
  const credentialOwnerUserId = opts.credentialOwnerUserId ?? userId;
  let extraEnvVars = opts.extraEnvVars;
  if (opts.providerAccountId) {
    const accountEnv = await resolveProviderAccountCredentials(
      ctx,
      opts.providerAccountId,
      credentialOwnerUserId,
      opts.model,
    );
    if (Object.keys(accountEnv).length > 0) {
      extraEnvVars = {
        ...extraEnvVars,
        ...accountEnv,
        // Attribution for the turn's usage-limit reading (usageLimits:report).
        // Set only inside this branch: plan limits are per account, so a reading
        // may only be attributed to the account whose credentials the run
        // actually authenticated with — a fallback to the team credential
        // reports no account and keeps its own row.
        PROVIDER_ACCOUNT_ID: opts.providerAccountId,
      };
      console.log(
        `[sandbox][launch] applied user provider account override entityId=${entityId} keys=${Object.keys(accountEnv).join(",")}`,
      );
    }
  }
  // The orchestrator flag lives on the session, so it is resolved here — the
  // single launch choke point — and minted into the MCP token as a claim.
  const launchSession =
    entityIdField === "sessionId"
      ? await ctx.runQuery(internal.sessions.getInternal, { id: entityId })
      : null;

  // Mint the sandbox auth token and MCP token in a single node action. This
  // replaces three separate runAction hops across two "use node" isolates, which
  // cold-started Node twice and dominated launch latency (~3s).
  const { sandboxToken, mcpToken } = await ctx.runAction(
    internal.sandboxJwt.mintSandboxSessionTokens,
    {
      userId,
      repoId,
      enableMcp: opts.enableMcp !== false,
      entityId,
      ...(entityIdField === "sessionId"
        ? { entityKind: "session" as const }
        : entityIdField === "taskId"
          ? { entityKind: "task" as const }
          : entityIdField === "projectId"
            ? { entityKind: "project" as const }
            : {}),
      ...(launchSession?.isOrchestrator ? { isOrchestrator: true } : {}),
    },
  );
  console.log(
    `[sandbox][launch] sandbox + MCP tokens minted in ${Date.now() - launchStartedAt}ms entityId=${entityId} (mcp=${mcpToken ? "yes" : "no"})`,
  );

  const mcpBaseUrl = mcpToken ? (process.env.CONVEX_SITE_URL ?? "") : "";

  // A catalog writer is deliberately short-lived and single-use. Unlike the
  // old fleet-constant HMAC, reading one sandbox's env cannot grant permanent
  // write access to the global composer catalog.
  const provider = getAIModelProvider(normalizeAIModel(opts.model));
  let harnessCatalogToken: string | undefined;
  if (provider === "claude") {
    harnessCatalogToken = randomBytes(32).toString("hex");
    await ctx.runMutation(internal.harnessSkills.issueReportToken, {
      tokenHash: createHash("sha256").update(harnessCatalogToken).digest("hex"),
      provider,
      sandboxId: sandbox.id,
      repoId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  }

  // System skills reach the agent as stub SKILL.md files in the checkout, and
  // the stubs are useless without the eva MCP server — so a launch with MCP
  // disabled ships an empty list, which prunes any leftovers.
  const installedSkillStubs = mcpToken
    ? await ctx.runQuery(internal.repoSystemSkills.listStubsForLaunch, {
        repoId,
      })
    : [];
  // The master's own skill skips the per-repo install gate — it belongs to the
  // session, not to whichever repo the master happens to be checked out on.
  // `get_skill` mirrors this bypass when it serves the content.
  const orchestratorSkill = SYSTEM_SKILLS["eva-orchestrator"];
  const systemSkillStubs =
    mcpToken && launchSession?.isOrchestrator === true
      ? [
          ...installedSkillStubs.filter(
            (stub) => stub.name !== orchestratorSkill.name,
          ),
          {
            name: orchestratorSkill.name,
            stub: buildStubMarkdown(orchestratorSkill),
          },
        ]
      : installedSkillStubs;

  await launchScript(
    sandbox,
    prompt,
    completionMutation,
    entityIdField,
    sandboxToken,
    entityId,
    {
      ...opts,
      extraEnvVars,
      mcpToken: mcpToken?.token,
      mcpBaseUrl,
      systemSkillsJson: JSON.stringify({ skills: systemSkillStubs }),
      harnessCatalogToken,
    },
  );
  console.log(
    `[sandbox][launch] launchScript completed in ${Date.now() - launchStartedAt}ms entityId=${entityId} sandboxId=${sandbox.id}`,
  );
}

/** Owner id types that can derive a stable per-owner Claude session UUID. */
type PersistableSessionId = Id<"sessions"> | Id<"projects"> | Id<"agentTasks">;

/** Derives a deterministic UUID v4 from a session ID hash for Claude session identification. */
export function sessionClaudeUuid(sessionId: PersistableSessionId): string {
  const hex = createHash("sha256")
    .update(String(sessionId))
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  const variantNibble = (parseInt(hex[16], 16) & 0x3) | 0x8;
  hex[16] = variantNibble.toString(16);
  return [
    hex.slice(0, 8).join(""),
    hex.slice(8, 12).join(""),
    hex.slice(12, 16).join(""),
    hex.slice(16, 20).join(""),
    hex.slice(20, 32).join(""),
  ].join("-");
}
