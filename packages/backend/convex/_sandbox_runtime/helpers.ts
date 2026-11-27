"use node";
import { randomToken, sha256Hex } from "@vvedantb/server";
import { createHash } from "crypto";
import { redactSecrets } from "@eva/shared/redactSecrets";
import type { GenericActionCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  EVA_CONFIG_PATH,
  evaAppFingerprints,
  findEvaApp,
  parseEvaConfig,
} from "../_evaConfig/config";
import { readEvaFileAtRef } from "../_evaConfig/sync";
import {
  resolveProviderAccountCredentials,
  resolveSandboxCredentials,
  resolveSandboxCredentialsOnly,
} from "../envVarResolver";
import { resolveConnectorLaunchEnv } from "../_connectors/resolve";
import type { SandboxClient, SandboxHandle } from "../_sandbox/provider";
import {
  SandboxCommandFailedError,
  SandboxExecTimeoutError,
} from "./sandboxErrors";
import { writeSandboxFile } from "./sandboxFiles";
import {
  buildDockerBootstrapLock,
  buildDockerdBackgroundStart,
  buildDockerdProcessCleanup,
  buildDockerdStaleRuntimeCleanup,
  buildDockerInfoWaitLoop,
  buildDockerSockPerms,
} from "./dockerBootstrap";
import { getSandboxClient } from "../_sandbox/factory";
import { launchScript } from "./launch";
import type { LinkedRepoEnvRow } from "./linkedReposEnv";
import { ensureSwapFile } from "./swap";
import { sleep } from "../_shared/async";
import { PACKAGE_HELPER_SCRIPT, pkgInstall } from "./packageManager";
import { getAIModelProvider, normalizeAIModel } from "../validators";
import { isReadOnlySandboxOwner } from "../_sessions/owner";

export const WORKSPACE_DIR = "/tmp/repo";
export const LEGACY_WORKSPACE_DIR = "/workspace/repo";

/** Kills prior agent runners without matching the current shell wrapper. */
export const KILL_PRIOR_AGENT_PROCESSES_CMD =
  'pid=$(cat /tmp/run-design.pid 2>/dev/null || true); if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then comm=$(cat "/proc/$pid/comm" 2>/dev/null || true); cmdline=$(tr "\\0" " " < "/proc/$pid/cmdline" 2>/dev/null || true); if [ "$comm" = "node" ]; then case "$cmdline" in *"/tmp/run-design.mjs"*) kill "$pid" 2>/dev/null || true;; esac; fi; fi; ' +
  "pkill -x claude 2>/dev/null || true; " +
  "pkill -x claude-code 2>/dev/null || true; " +
  "pkill -x codex 2>/dev/null || true; " +
  "pkill -f '[o]pencode run' 2>/dev/null || true; " +
  "pkill -x cursor-agent 2>/dev/null || true; " +
  "true";

/** Returns a shell expression that resolves to the active workspace directory. */
export function workspaceDirShell(): string {
  return `$(if [ -d ${WORKSPACE_DIR} ]; then printf %s ${WORKSPACE_DIR}; elif [ -d ${LEGACY_WORKSPACE_DIR} ]; then printf %s ${LEGACY_WORKSPACE_DIR}; else printf %s ${WORKSPACE_DIR}; fi)`;
}
export const DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS = 60;
export const SNAPSHOT_SANDBOX_READY_TIMEOUT_SECONDS = 30;
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
    (message) => new SandboxExecTimeoutError(message),
  );
  if (resp.exitCode !== 0) {
    const output = redactSecrets(resp.output?.trim() ?? "");
    const cmdHint = `cmd=${JSON.stringify(redactSecrets(cmd.slice(0, 80)))}`;
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
  }

  if (await bootstrapVercelDocker(sandbox)) {
    return true;
  }

  try {
    await execHandle(
      sandbox,
      [
        PACKAGE_HELPER_SCRIPT,
        `command -v docker >/dev/null 2>&1 || ${pkgInstall("docker")} || true`,
        "command -v docker >/dev/null 2>&1 || exit 1",
        ...buildDockerBootstrapLock(60),
        ...buildDockerdProcessCleanup(),
        "sleep 1",
        buildDockerdStaleRuntimeCleanup(),
        "sudo systemctl start docker 2>/dev/null || true",
        buildDockerdBackgroundStart(),
        buildDockerInfoWaitLoop(60),
        buildDockerSockPerms(),
        "docker info >/dev/null 2>&1",
      ].join("\n"),
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
  }

  const script = [
    "set -e",
    'echo "bootstrap-docker:start"',
    PACKAGE_HELPER_SCRIPT,
    `command -v docker >/dev/null 2>&1 || ${pkgInstall("docker")}`,
    'command -v docker >/dev/null 2>&1 || { echo "bootstrap-docker:no-binary"; exit 1; }',
    ...buildDockerBootstrapLock(150),
    ...buildDockerdProcessCleanup(true),
    buildDockerdStaleRuntimeCleanup(true),
    "sudo systemctl start docker 2>/dev/null || true",
    buildDockerdBackgroundStart(),
    buildDockerInfoWaitLoop(90),
    buildDockerSockPerms(),
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
    skipDocker?: boolean;
    skipExecProbe?: boolean;
    resumeAfterStop?: boolean;
  } = {},
): Promise<void> {
  const defaultTimeout =
    options.timeoutSeconds ?? DEFAULT_SANDBOX_READY_TIMEOUT_SECONDS;
  const startedAt = Date.now();

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

async function branchSeedFingerprint(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  branch: string,
): Promise<string | null> {
  try {
    const target = await ctx.runQuery(internal._evaConfig.cache.getSyncTarget, {
      repoId,
    });
    if (!target || !target.hasEvaConfig || target.ref === branch) return null;
    const text = await readEvaFileAtRef(target, EVA_CONFIG_PATH, branch);
    if (text === null) return null;
    const parsed = parseEvaConfig(text);
    if (!parsed.ok) return null;
    const app = findEvaApp(parsed.value, target.rootDirectory);
    return app ? evaAppFingerprints(parsed.value, app).seed : null;
  } catch (error) {
    console.warn(
      `[sandbox] branchSeedFingerprint repoId=${repoId} branch=${branch}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** Resolves the provider client, sandbox env vars, and snapshot name for a repo. */
export async function resolveSandboxContext(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  opts?: {
    repoGroupId?: Id<"repoGroups">;
    branch?: string;
  },
): Promise<{
  client: SandboxClient;
  sandboxEnvVars: Record<string, string>;
  snapshotName: string | undefined;
}> {
  const startedAt = Date.now();
  const repoGroupId = opts?.repoGroupId;
  const [{ credentials, sandboxEnvVars }, repoSnapshot, groupSnapshotName] =
    await Promise.all([
      resolveSandboxCredentials(ctx, repoId),
      ctx.runQuery(internal.repoSnapshots.getRepoSnapshotName, { repoId }),
      repoGroupId
        ? ctx.runQuery(internal.repoGroups.getGroupSnapshotForBoot, {
            groupId: repoGroupId,
          })
        : null,
    ]);
  const client = getSandboxClient(credentials);
  let snapshotName = groupSnapshotName || repoSnapshot?.snapshotName;
  if (
    !groupSnapshotName &&
    opts?.branch &&
    repoSnapshot?.seededFingerprint
  ) {
    const branchFingerprint = await branchSeedFingerprint(
      ctx,
      repoId,
      opts.branch,
    );
    if (
      branchFingerprint !== null &&
      branchFingerprint !== repoSnapshot.seededFingerprint
    ) {
      console.log(
        `[sandbox] resolveSandboxContext repoId=${repoId} branch=${opts.branch}: .eva/config.json changes the seed inputs — skipping the seeded snapshot`,
      );
      const base = await ctx.runQuery(
        internal.repoSnapshots.getRepoSnapshotName,
        { repoId, skipSeeded: true },
      );
      snapshotName = base?.snapshotName;
    }
  }
  console.log(
    `[sandbox] resolveSandboxContext repoId=${repoId} kind=${client.kind} repoGroupId=${opts?.repoGroupId ?? "none"} elapsed=${Date.now() - startedAt}ms`,
  );
  return {
    client,
    sandboxEnvVars: { ...sandboxEnvVars, REPO_ID: repoId },
    snapshotName,
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

/**
 * Handle for a best-effort job (kill, diagnostics, deadline extension) that
 * must never wake a stopped VM: `null` unless the provider reports it running.
 * Lazy resume is off (`withoutLazyResume`), so an exec here would only throw;
 * this skips the job cleanly instead of logging a failure.
 */
export async function getRunningSandboxHandle(
  ctx: GenericActionCtx<DataModel>,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<SandboxHandle | null> {
  const sandbox = await getSandboxHandle(ctx, repoId, sandboxId);
  return sandbox.state === "running" ? sandbox : null;
}

const SANDBOX_LAUNCH_LOCK_TTL_MS = 120_000;
const SANDBOX_LAUNCH_LOCK_WAIT_MS = 120_000;
const SANDBOX_LAUNCH_LOCK_POLL_MS = 500;

async function withSandboxLaunchLock<T>(
  ctx: GenericActionCtx<DataModel>,
  sandboxId: string,
  entityId: string,
  launch: () => Promise<T>,
): Promise<T> {
  const key = `sandbox:${sandboxId}`;
  const claim = () =>
    ctx.runMutation(internal.sandboxDaemon.claimDaemonLaunchLease, {
      entityId: key,
      ttlMs: SANDBOX_LAUNCH_LOCK_TTL_MS,
    });
  const waitStartedAt = Date.now();
  let held = await claim();
  while (!held && Date.now() - waitStartedAt < SANDBOX_LAUNCH_LOCK_WAIT_MS) {
    await sleep(SANDBOX_LAUNCH_LOCK_POLL_MS);
    held = await claim();
  }
  const waitedMs = Date.now() - waitStartedAt;
  if (!held) {
    console.warn(
      `[sandbox][launch] launch lock still held after ${waitedMs}ms — launching anyway entityId=${entityId} sandboxId=${sandboxId}`,
    );
  } else if (waitedMs > 0) {
    console.log(
      `[sandbox][launch] waited ${waitedMs}ms for launch lock entityId=${entityId} sandboxId=${sandboxId}`,
    );
  }
  try {
    return await launch();
  } finally {
    if (held) {
      await ctx.runMutation(internal.sandboxDaemon.releaseDaemonLaunchLease, {
        entityId: key,
      });
    }
  }
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
    systemPrompt?: string;
    extraEnvVars?: Record<string, string>;
    claudeSessionId?: string;
    enableMcp?: boolean;
    providerAccountId?: Id<"userProviderAccounts">;
    credentialOwnerUserId?: Id<"users">;
    claimMutation?: string;
    openSyntheticTurnMutation?: string;
    completeSyntheticTurnMutation?: string;
    updateBackgroundAgentsMutation?: string;
    updateGoalMutation?: string;
  } = {},
): Promise<void> {
  const launchStartedAt = Date.now();
  console.log(
    `[sandbox][launch] signAndLaunchScript started entityId=${entityId} mutation=${completionMutation} repoId=${repoId} sandboxId=${sandbox.id}`,
  );

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
        PROVIDER_ACCOUNT_ID: opts.providerAccountId,
      };
      console.log(
        `[sandbox][launch] applied user provider account override entityId=${entityId} keys=${Object.keys(accountEnv).join(",")}`,
      );
    }
  }
  const launchChat =
    entityIdField === "chatId"
      ? await ctx.runQuery(internal.sessionChats.getInternal, {
          chatId: entityId,
        })
      : null;
  const launchSession =
    launchChat?.session ??
    (entityIdField === "sessionId"
      ? await ctx.runQuery(internal.sessions.getInternal, { id: entityId })
      : null);

  const workspaceSession =
    launchSession ??
    (entityIdField === "taskId"
      ? await ctx.runQuery(internal.sessions.getForEntityInternal, {
          entityKind: "task",
          entityId,
        })
      : null);
  let linkedRepos: LinkedRepoEnvRow[] = [];
  if (workspaceSession && (workspaceSession.linkedRepoCount ?? 0) > 0) {
    const linkedRows: LinkedRepoEnvRow[] = await ctx.runQuery(
      internal.sessions.listLinkedReposInternal,
      { sessionId: workspaceSession._id },
    );
    linkedRepos = linkedRows;
  }

  const { sandboxToken, mcpToken } = await ctx.runAction(
    internal.sandboxJwt.mintSandboxSessionTokens,
    {
      userId,
      repoId,
      enableMcp: opts.enableMcp !== false,
      entityId: launchSession ? String(launchSession._id) : entityId,
      ...(launchChat ? { chatId: entityId } : {}),
      readOnlyGit:
        entityIdField === "projectId" ||
        (launchSession !== null && isReadOnlySandboxOwner(launchSession.owner)),
      ...(launchSession
        ? { entityKind: "session" as const }
        : entityIdField === "taskId"
          ? { entityKind: "task" as const }
          : entityIdField === "projectId"
            ? { entityKind: "project" as const }
            : {}),
    },
  );
  console.log(
    `[sandbox][launch] sandbox + MCP tokens minted in ${Date.now() - launchStartedAt}ms entityId=${entityId} (mcp=${mcpToken ? "yes" : "no"})`,
  );

  const mcpBaseUrl = mcpToken ? (process.env.CONVEX_SITE_URL ?? "") : "";

  if (opts.enableMcp !== false) {
    const connectorEnv = await resolveConnectorLaunchEnv(ctx, userId, repoId);
    if (Object.keys(connectorEnv).length > 0) {
      extraEnvVars = { ...extraEnvVars, ...connectorEnv };
    }
  }

  const provider = getAIModelProvider(normalizeAIModel(opts.model));
  let harnessCatalogToken: string | undefined;
  if (provider === "claude") {
    harnessCatalogToken = randomToken(32, "hex");
    await ctx.runMutation(internal.harnessSkills.issueReportToken, {
      tokenHash: await sha256Hex(harnessCatalogToken),
      provider,
      sandboxId: sandbox.id,
      repoId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
  }

  const systemSkillStubs = mcpToken
    ? await ctx.runQuery(internal.repoSystemSkills.listStubsForLaunch, {
        repoId,
      })
    : [];

  await withSandboxLaunchLock(ctx, sandbox.id, entityId, () =>
    launchScript(
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
        ...(linkedRepos.length > 0 ? { linkedRepos } : {}),
      },
    ),
  );
  console.log(
    `[sandbox][launch] launchScript completed in ${Date.now() - launchStartedAt}ms entityId=${entityId} sandboxId=${sandbox.id}`,
  );
}

type PersistableSessionId =
  | Id<"sessionChats">
  | Id<"sessions">
  | Id<"projects">
  | Id<"agentTasks">;

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
