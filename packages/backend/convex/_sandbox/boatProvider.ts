"use node";

/**
 * Boat (boat.dev) implementation of the provider-neutral contract (./provider.ts).
 *
 * Provider deltas vs Vercel:
 * - Identity: Boat ids are `bx_…` (see `isBoatSandboxId`); `./factory.ts`
 *   routes existing sandboxes by that prefix, so a repo can switch provider
 *   while its old sandboxes keep working.
 * - Snapshots are *template sandboxes*: `createSnapshot` stops the sandbox and
 *   returns its own id, and `create({ snapshot })` forks it. Boat caps named
 *   snapshots at 10 per account; stopped templates are free and unlimited.
 *   Tearing down the prep sandbox with `preserveSnapshotIds: [ownId]` keeps it.
 * - Lifecycle: `ttlSeconds` counts from create/resume and a PATCH resets it to
 *   now + ttl, so `extendTimeout` maps onto it directly. Stop always snapshots
 *   (Boat keeps the latest per sandbox for free); processes die, files persist.
 * - Commands: the API caps sync runs at 600s and defaults to 30s, so every exec
 *   passes an explicit timeout and longer ones go detached + polled.
 * - Files: the file API only writes under /home/user or /tmp; anything else is
 *   staged in /tmp and moved into place.
 * - Platform: Ubuntu 24.04 as `user` (passwordless sudo) with Docker, Chrome,
 *   tmux, jq and ffmpeg preinstalled. `bootstrap` lays down the paths the
 *   Vercel-era runtime assumes (/vercel/sandbox env file, /home/eva).
 */

import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  boatRequest,
  BoatApiError,
  commandResponse,
  commandStatusResponse,
  detachedResponse,
  emptyResponse,
  hostResponse,
  isBoatSandboxId,
  sandboxListResponse,
  sandboxPath,
  sandboxResponse,
  type BoatRequestOptions,
  type BoatSandbox,
} from "./boatApi";
import {
  SandboxProviderError,
  type BoatCredentials,
  type CreateSnapshotParams,
  type PreviewUrl,
  type SandboxClient,
  type SandboxCreateParams,
  type SandboxDesktop,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxGit,
  type SandboxHandle,
  type SandboxProviderKind,
  type SandboxSnapshotInfo,
  type SandboxState,
} from "./provider";
import {
  APT_DESKTOP_INSTALL,
  ShellDesktop,
  ShellGit,
} from "./shellCapabilities";
import { EVA_ENV_FILE } from "./vercelEnvFile";

type BoatMachineType = "small" | "default" | "large";

function boatMachineType(): BoatMachineType {
  const configured = process.env.SANDBOX_BOAT_TYPE;
  return configured === "small" || configured === "default"
    ? configured
    : "large";
}

/** Boat's sync command cap; longer commands run detached and are polled. */
const SYNC_EXEC_MAX_SECONDS = 600;
/**
 * Floor on create/fork readiness waits. Callers pass Vercel-tuned values (30s
 * from a snapshot, where restores are sub-second); a Boat fork of a full
 * seeded Eva template took 40s in the 2026-09-30 run.
 */
const MIN_READY_TIMEOUT_SECONDS = 180;
/** Auto-stop ceiling on Boat free-trial accounts. */
const TRIAL_MAX_TTL_SECONDS = 2 * 60 * 60;
/** Boat's own maximum numeric TTL (30 days). */
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
const STOP_CONFIRMATION_TIMEOUT_MS = 180_000;
const POLL_MS = 1_000;
/** Boat reports `ready` a moment before its agent accepts commands; probe until it does. */
const COMMAND_READY_TIMEOUT_MS = 30_000;
/** Sandbox `name` carries eva's labels (Boat has no tags) so sweeps can filter by them. */
const NAME_MAX_LENGTH = 200;

const SOURCE_ENV = `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE};`;

/** Single-quotes a string for bash. */
function shq(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Home-directory store behind the paths Boat snapshots would otherwise drop. */
const PERSIST_ROOT = "/home/user/.eva-persist";

/**
 * Paths the Vercel-era runtime hard-codes, each linked into {@link PERSIST_ROOT}.
 * Boat snapshots (every resume and fork) capture only /home/user, Docker
 * volumes and system dirs — never /tmp, /vercel or /home/eva — so without the
 * links a resumed or forked sandbox came back without its repo, env file or
 * agent config (seen in the 2026-09-30 e2e: a fork lost /tmp/repo).
 */
const PERSISTED_PATHS: ReadonlyArray<readonly [path: string, store: string]> = [
  ["/tmp/repo", "repo"],
  ["/tmp/workspace", "workspace"],
  ["/vercel/sandbox", "vercel-sandbox"],
  ["/home/eva", "home-eva"],
];

/**
 * Runs on every create and every resume, before any caller I/O: recreates the
 * links above (they live outside the captured dirs, so they vanish on each
 * boot while their targets persist), and a temp dir on the same filesystem as
 * the repo (Convex's local backend renames temp files into its storage dir
 * and fails with EXDEV across mounts). Idempotent.
 */
export const BOOTSTRAP_SCRIPT = [
  "set -e",
  `mkdir -p /home/user/tmp ${PERSISTED_PATHS.map(([, store]) => `${PERSIST_ROOT}/${store}`).join(" ")}`,
  `chmod 777 ${PERSIST_ROOT}/home-eva`,
  // A real directory at a linked path (created before the link existed) is
  // merged into the store, then replaced by the link. Links stay root-owned:
  // fs.protected_symlinks stops root following a `user`-owned link in sticky
  // /tmp, which broke every sudo exec with cwd /tmp/repo; a root-owned link in
  // root-owned /tmp is followable by both.
  'link() { if [ -L "$1" ]; then sudo chown -h root:root "$1"; return 0; fi; if [ -d "$1" ]; then sudo cp -a "$1/." "$2/"; sudo rm -rf "$1"; fi; sudo mkdir -p "$(dirname "$1")"; sudo ln -sfn "$2" "$1"; }',
  ...PERSISTED_PATHS.map(
    ([path, store]) => `link ${path} ${PERSIST_ROOT}/${store}`,
  ),
  "[ -e /home/vercel-sandbox ] || sudo ln -s /home/user /home/vercel-sandbox",
  "printf '%s\\n' 'export TMPDIR=/home/user/tmp' 'export CONVEX_TMPDIR=/home/user/tmp' | sudo tee /etc/profile.d/eva-boat.sh >/dev/null",
].join("\n");

/** Maps Boat's sandbox state onto the neutral {@link SandboxState}. */
export function normalizeBoatState(raw: string): SandboxState {
  switch (raw) {
    case "ready":
    case "idle":
    case "running":
      return "running";
    case "archived":
      return "stopped";
    // Mid-stop must NOT look like idle-stopped (see VercelSandboxHandle.state):
    // callers that resume a "stopped" sandbox would wake one the user just stopped.
    case "archiving":
    case "init":
    case "creating":
    case "provisioning":
    case "provisioned":
    case "cloning":
    case "resuming":
      return "starting";
    case "error":
      return "error";
    case "deleted":
    case "deleting":
      return "gone";
    default:
      return "unknown";
  }
}

/** Neutral snapshot status for a template sandbox. */
export function boatTemplateStatus(
  sandbox: BoatSandbox,
): SandboxSnapshotInfo["status"] {
  if (sandbox.state === "error" || sandbox.lastSnapshotStatus === "failed") {
    return "error";
  }
  if (sandbox.state === "archived" && sandbox.snapshotAvailable !== false) {
    return "ready";
  }
  return "pending";
}

/** Encodes labels into a sandbox name: `eva k=v k=v`. */
export function labelsToName(
  labels: Record<string, string> | undefined,
): string {
  const pairs = Object.entries(labels ?? {}).map(([k, v]) => `${k}=${v}`);
  return ["eva", ...pairs].join(" ").slice(0, NAME_MAX_LENGTH);
}

/** Decodes {@link labelsToName}; names Eva did not write yield `{}`. */
export function labelsFromName(name: string): Record<string, string> {
  const [head, ...pairs] = name.split(" ");
  if (head !== "eva") return {};
  const labels: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at > 0) labels[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return labels;
}

function providerError(message: string, error: unknown): SandboxProviderError {
  if (error instanceof BoatApiError) {
    return new SandboxProviderError(`${message}: ${error.message}`, {
      httpStatus: error.status,
      detail: `${error.code}: ${error.message}`,
    });
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new SandboxProviderError(`${message}: ${detail}`, { detail });
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Paths the file API accepts (canonicalised under /home/user or /tmp). */
function isDirectWritePath(path: string): boolean {
  return (
    path.startsWith("/tmp/") ||
    path.startsWith("/home/user/") ||
    !path.startsWith("/")
  );
}

/** A handle to one Boat sandbox, exposing the neutral {@link SandboxHandle}. */
class BoatSandboxHandle implements SandboxHandle {
  readonly desktop: SandboxDesktop;

  constructor(
    private sandbox: BoatSandbox,
    private readonly creds: BoatCredentials,
  ) {
    this.desktop = new ShellDesktop(this, APT_DESKTOP_INSTALL);
  }

  private api<S extends z.ZodTypeAny>(
    schema: S,
    method: string,
    suffix: string,
    options?: BoatRequestOptions,
  ) {
    return boatRequest(
      this.creds.apiKey,
      schema,
      method,
      sandboxPath(this.sandbox.id, suffix),
      options,
    );
  }

  get git(): SandboxGit {
    return new ShellGit(this);
  }

  get id(): string {
    return this.sandbox.id;
  }
  get cpu(): number | undefined {
    return this.sandbox.vcpu ?? undefined;
  }
  get memory(): number | undefined {
    return this.sandbox.memoryGB ? this.sandbox.memoryGB * 1024 : undefined;
  }
  get disk(): number | undefined {
    return undefined;
  }
  get state(): SandboxState {
    return normalizeBoatState(this.sandbox.state);
  }
  get errorReason(): string | null {
    return this.sandbox.error ?? null;
  }

  async classifyForReconcile(): Promise<"alive" | "dead" | "transient"> {
    try {
      await this.refresh();
    } catch (error) {
      if (error instanceof SandboxProviderError && error.httpStatus === 404) {
        return "dead";
      }
      return "transient";
    }
    const state = this.state;
    if (state === "running") return "alive";
    if (state === "stopped" || state === "error" || state === "gone") {
      return "dead";
    }
    return "transient";
  }

  async refresh(): Promise<void> {
    try {
      this.sandbox = (await this.api(sandboxResponse, "GET", "")).sandbox;
    } catch (error) {
      throw providerError(`boat get failed (sandbox=${this.id})`, error);
    }
  }

  /** Wraps a command the way Vercel exec does: login shell, env file sourced, optional sudo. */
  private wrap(cmd: string, opts?: SandboxExecOptions): string {
    const exports = Object.entries(opts?.env ?? {})
      .map(([k, v]) => `export ${k}=${shq(v)};`)
      .join(" ");
    const cd = opts?.cwd ? `cd ${shq(opts.cwd)} && ` : "";
    const script = `${SOURCE_ENV} ${exports} ${cd}${cmd}`;
    return opts?.sudo
      ? `sudo -E bash -lc ${shq(script)}`
      : `bash -lc ${shq(script)}`;
  }

  async exec(
    cmd: string,
    opts?: SandboxExecOptions,
  ): Promise<SandboxExecResult> {
    const timeoutSeconds = opts?.timeoutSeconds ?? SYNC_EXEC_MAX_SECONDS;
    if (timeoutSeconds > SYNC_EXEC_MAX_SECONDS) {
      return this.execLong(cmd, timeoutSeconds, opts);
    }
    try {
      const result = await this.api(commandResponse, "POST", "/commands", {
        body: {
          command: this.wrap(cmd, opts),
          timeoutSeconds: Math.max(1, Math.ceil(timeoutSeconds)),
        },
      });
      return {
        // Vercel reports a killed command as a non-zero exit; match it.
        exitCode: result.exitCode ?? (result.timedOut ? 124 : 1),
        output: result.stdout + result.stderr,
      };
    } catch (error) {
      throw providerError(
        `boat exec failed (cwd=${opts?.cwd ?? "(default)"}, cmd=${cmd.slice(0, 120)})`,
        error,
      );
    }
  }

  /** Commands over the sync cap: start detached, poll until exit or the caller's deadline. */
  private async execLong(
    cmd: string,
    timeoutSeconds: number,
    opts?: SandboxExecOptions,
  ): Promise<SandboxExecResult> {
    const processId = await this.startDetached(cmd, opts);
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      await sleep(2_000);
      const status = await this.api(
        commandStatusResponse,
        "GET",
        `/commands/${processId}`,
      );
      if (!status.running) {
        return {
          exitCode: status.exitCode ?? 1,
          output: status.stdout + status.stderr,
        };
      }
    }
    await this.exec(`kill ${processId} 2>/dev/null || true`, {
      timeoutSeconds: 10,
    });
    return { exitCode: 124, output: `timed out after ${timeoutSeconds}s` };
  }

  private async startDetached(
    cmd: string,
    opts?: SandboxExecOptions,
  ): Promise<number> {
    try {
      const { processId } = await this.api(
        detachedResponse,
        "POST",
        "/commands",
        { body: { command: this.wrap(cmd, opts), detached: true } },
      );
      return processId;
    } catch (error) {
      throw providerError(
        `boat detached exec failed (cmd=${cmd.slice(0, 120)})`,
        error,
      );
    }
  }

  async execDetached(cmd: string, opts?: SandboxExecOptions): Promise<void> {
    // Boat runs detached commands under the sandbox user's systemd manager, so
    // they outlive the API call like Vercel's native detached exec.
    await this.startDetached(cmd, opts);
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const encoded = {
      content:
        typeof content === "string"
          ? content
          : Buffer.from(content).toString("base64"),
      encoding: typeof content === "string" ? "utf8" : "base64",
    };
    const target = isDirectWritePath(path)
      ? path
      : `/tmp/.eva-upload-${randomUUID()}`;
    try {
      await this.api(emptyResponse, "PUT", "/files", {
        body: { path: target, ...encoded },
      });
    } catch (error) {
      throw providerError(`boat writeFile failed (path=${path})`, error);
    }
    if (target === path) return;
    const dir = path.slice(0, path.lastIndexOf("/")) || "/";
    const moved = await this.exec(
      `{ mkdir -p ${shq(dir)} 2>/dev/null && mv ${shq(target)} ${shq(path)}; } 2>/dev/null || { sudo mkdir -p ${shq(dir)} && sudo mv ${shq(target)} ${shq(path)} && sudo chown user:user ${shq(path)}; }`,
      { timeoutSeconds: 30 },
    );
    if (moved.exitCode !== 0) {
      throw new Error(
        `boat writeFile: could not move upload into ${path}: ${moved.output.slice(-500)}`,
      );
    }
  }

  /** Polls until Boat's agent answers a trivial command (it lags `ready` briefly). */
  async waitForCommands(): Promise<void> {
    const deadline = Date.now() + COMMAND_READY_TIMEOUT_MS;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const probe = await this.exec("true", { timeoutSeconds: 10 });
        if (probe.exitCode === 0) return;
      } catch (error) {
        lastError = error;
      }
      await sleep(POLL_MS);
    }
    throw providerError(
      `boat sandbox ${this.id} did not accept commands within ${COMMAND_READY_TIMEOUT_MS / 1000}s`,
      lastError ?? "no response",
    );
  }

  /** Polls until the sandbox is running, or throws when it errors or the deadline passes. */
  async waitForRunning(timeoutSeconds: number): Promise<void> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      await this.refresh();
      const state = this.state;
      if (state === "running") {
        await this.waitForCommands();
        return;
      }
      if (state === "error" || state === "gone") {
        throw new SandboxProviderError(
          `boat sandbox ${this.id} entered ${this.sandbox.state}${this.sandbox.error ? `: ${this.sandbox.error}` : ""}`,
          { detail: this.sandbox.error ?? this.sandbox.state },
        );
      }
      await sleep(POLL_MS);
    }
    throw new SandboxProviderError(
      `boat start: sandbox ${this.id} did not reach running within ${timeoutSeconds}s (state: ${this.sandbox.state})`,
      { detail: "" },
    );
  }

  private async waitForArchived(): Promise<void> {
    const deadline = Date.now() + STOP_CONFIRMATION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await this.refresh();
      if (this.sandbox.state === "archived") return;
      if (this.sandbox.state === "error") {
        throw new Error(
          `boat stop: sandbox ${this.id} errored while stopping${this.sandbox.error ? `: ${this.sandbox.error}` : ""}`,
        );
      }
      await sleep(POLL_MS);
    }
    throw new Error(
      `boat stop: sandbox ${this.id} did not archive within ${STOP_CONFIRMATION_TIMEOUT_MS}ms (last state: ${this.sandbox.state})`,
    );
  }

  async start(
    timeoutSeconds: number,
    opts?: { resumeAfterStop?: boolean },
  ): Promise<void> {
    await this.refresh();
    if (this.state === "running") return;
    // Same contract as Vercel: an in-flight stop is waited out, then only an
    // explicit user start resumes — background callers must not resurrect a
    // sandbox the user just stopped.
    if (this.sandbox.state === "archiving") {
      await this.waitForArchived();
      if (opts?.resumeAfterStop !== true) {
        throw new Error(
          `boat start: sandbox ${this.id} was stopped while a start was in progress`,
        );
      }
    }
    if (this.sandbox.state === "archived") {
      try {
        this.sandbox = (
          await this.api(sandboxResponse, "POST", "/resume", { body: {} })
        ).sandbox;
      } catch (error) {
        throw providerError(`boat resume failed (sandbox=${this.id})`, error);
      }
    }
    await this.waitForRunning(
      Math.max(timeoutSeconds, MIN_READY_TIMEOUT_SECONDS),
    );
    await this.bootstrap();
  }

  /** See {@link BOOTSTRAP_SCRIPT}; must run after every boot, before caller I/O. */
  async bootstrap(): Promise<void> {
    const boot = await this.exec(BOOTSTRAP_SCRIPT, { timeoutSeconds: 60 });
    if (boot.exitCode !== 0) {
      throw new Error(`boat bootstrap failed: ${boot.output.slice(-500)}`);
    }
  }

  async stop(): Promise<void> {
    await this.refresh();
    if (this.sandbox.state === "archived") return;
    if (this.sandbox.state !== "archiving") {
      try {
        await this.api(sandboxResponse, "POST", "/stop", { body: {} });
      } catch (error) {
        throw providerError(`boat stop failed (sandbox=${this.id})`, error);
      }
    }
    await this.waitForArchived();
  }

  async archive(): Promise<void> {
    await this.stop();
  }

  async extendTimeout(durationMs: number): Promise<void> {
    // PATCH ttlSeconds resets the auto-archive to now + ttl, so only ask once
    // the current deadline is inside the window the caller wants covered.
    const archiveAt = this.sandbox.archiveAfter
      ? Date.parse(this.sandbox.archiveAfter)
      : undefined;
    if (archiveAt !== undefined && archiveAt - Date.now() > durationMs) return;
    const ttlSeconds = Math.min(Math.ceil(durationMs / 1000), MAX_TTL_SECONDS);
    try {
      this.sandbox = (
        await this.api(sandboxResponse, "PATCH", "", { body: { ttlSeconds } })
      ).sandbox;
    } catch (error) {
      throw providerError(
        `boat extendTimeout failed (sandbox=${this.id}, ttlSeconds=${ttlSeconds})`,
        error,
      );
    }
  }

  async delete(options?: {
    preserveSnapshotIds?: ReadonlyArray<string>;
  }): Promise<void> {
    // A template sandbox IS its snapshot: keeping the snapshot means keeping it.
    if (options?.preserveSnapshotIds?.includes(this.id)) {
      console.log(`[boat] delete skipped: ${this.id} is a preserved template`);
      return;
    }
    try {
      await this.api(emptyResponse, "DELETE", "", {
        headers: { "X-Ascii-Confirm-Delete": this.id },
      });
    } catch (error) {
      if (error instanceof BoatApiError && error.status === 404) return;
      throw providerError(`boat delete failed (sandbox=${this.id})`, error);
    }
  }

  async previewUrl(port: number): Promise<PreviewUrl> {
    // Public: Eva's own preview grant (in-sandbox auth proxy) is the gate, as
    // on Vercel. Boat's `_token` gate would sit in front of it and break the
    // grant redirect flow.
    try {
      const { url } = await this.api(hostResponse, "POST", "/host", {
        body: { port, public: true },
      });
      return { url, port };
    } catch (error) {
      throw providerError(
        `boat host failed (sandbox=${this.id}, port=${port})`,
        error,
      );
    }
  }

  async createSnapshot(
    params: CreateSnapshotParams,
  ): Promise<{ snapshotId: string }> {
    // The stopped sandbox becomes the template; `getSnapshot` polls its archive.
    try {
      await this.api(sandboxResponse, "PATCH", "", {
        body: { name: labelsToName({ template: params.name ?? "unnamed" }) },
      });
      await this.api(sandboxResponse, "POST", "/stop", { body: {} });
    } catch (error) {
      throw providerError(
        `boat createSnapshot failed (sandbox=${this.id}, name=${params.name ?? "unnamed"})`,
        error,
      );
    }
    return { snapshotId: this.id };
  }
}

/** Boat-backed provider client, scoped to one API key. */
class BoatSandboxClient implements SandboxClient {
  readonly kind: SandboxProviderKind = "boat";

  constructor(private readonly creds: BoatCredentials) {}

  private api<S extends z.ZodTypeAny>(
    schema: S,
    method: string,
    path: string,
    options?: BoatRequestOptions,
  ) {
    return boatRequest(this.creds.apiKey, schema, method, path, options);
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    // Env is written to EVA_ENV_FILE by callers after create, like Vercel.
    // Boat has no 4 KB cap, but one delivery path for both keeps them in step.
    // Auto-archive is the leak backstop only (Start/Stop own the lifecycle), so
    // it is floored to a day like Vercel's session cap.
    const ttlSeconds = Math.min(
      Math.max(params.lifecycle.autoStopMinutes, 24 * 60) * 60,
      MAX_TTL_SECONDS,
    );
    const body = {
      type: boatMachineType(),
      // Never hand the Boat account's own secrets/repos to eva sandboxes.
      noEnv: true,
    };
    // Only Boat templates can seed a Boat sandbox; a stale Vercel `snap_*`
    // left on a repo that just switched boots bare instead of failing.
    const template =
      params.snapshot && isBoatSandboxId(params.snapshot)
        ? params.snapshot
        : undefined;
    if (params.snapshot && !template) {
      console.warn(
        `[boat] ignoring non-Boat snapshot ${params.snapshot}; booting a fresh sandbox`,
      );
    }
    const path = template ? sandboxPath(template, "/fork") : "/sandboxes";
    const post = (ttl: number) =>
      this.api(sandboxResponse, "POST", path, {
        body: { ...body, ttlSeconds: ttl },
        headers: { "Idempotency-Key": randomUUID() },
      });
    let created: BoatSandbox;
    try {
      try {
        created = (await post(ttlSeconds)).sandbox;
      } catch (error) {
        // Trial accounts cap auto-stop at 2h. The stall watchdog extends the
        // deadline during live work (extendTimeout), so a shorter backstop is
        // safe; retry at the cap rather than refusing to create.
        if (
          !(error instanceof BoatApiError) ||
          error.code !== "trial_auto_stop_required"
        ) {
          throw error;
        }
        created = (await post(TRIAL_MAX_TTL_SECONDS)).sandbox;
      }
    } catch (error) {
      throw providerError(
        `boat create failed (template=${template ?? "none"}, type=${body.type}, ttlSeconds=${ttlSeconds}, envKeys=[${Object.keys(params.envVars ?? {}).join(",")}])`,
        error,
      );
    }
    const handle = new BoatSandboxHandle(created, this.creds);
    try {
      await this.api(sandboxResponse, "PATCH", sandboxPath(created.id), {
        body: { name: labelsToName(params.lifecycle.labels) },
      });
      await handle.waitForRunning(
        Math.max(params.readyTimeoutSeconds ?? 0, MIN_READY_TIMEOUT_SECONDS),
      );
      await handle.bootstrap();
    } catch (error) {
      // Never leak a billing sandbox the caller has no id for.
      await handle.delete().catch(() => undefined);
      throw error;
    }
    console.log(
      `[boat] created sandbox=${created.id} template=${template ?? "none"} type=${body.type}`,
    );
    return handle;
  }

  async get(sandboxId: string): Promise<SandboxHandle> {
    try {
      const { sandbox } = await this.api(
        sandboxResponse,
        "GET",
        sandboxPath(sandboxId),
      );
      return new BoatSandboxHandle(sandbox, this.creds);
    } catch (error) {
      throw providerError(`boat get failed (sandbox=${sandboxId})`, error);
    }
  }

  async getSnapshot(ref: string): Promise<SandboxSnapshotInfo | null> {
    if (!isBoatSandboxId(ref)) return null;
    try {
      const { sandbox } = await this.api(
        sandboxResponse,
        "GET",
        sandboxPath(ref),
      );
      const status = boatTemplateStatus(sandbox);
      return {
        id: sandbox.id,
        status,
        errorReason:
          status === "error" ? (sandbox.error ?? sandbox.state) : null,
        raw: sandbox.state,
      };
    } catch {
      return null;
    }
  }

  async deleteSnapshot(ref: string): Promise<boolean> {
    if (!isBoatSandboxId(ref)) return false;
    try {
      await this.api(emptyResponse, "DELETE", sandboxPath(ref), {
        headers: { "X-Ascii-Confirm-Delete": ref },
      });
      return true;
    } catch {
      return false;
    }
  }
}

/** Every sandbox on the account, with the labels Eva encoded into its name. */
export async function listBoatSandboxes(
  creds: BoatCredentials,
): Promise<
  Array<{ id: string; state: string; labels: Record<string, string> }>
> {
  const out: Array<{
    id: string;
    state: string;
    labels: Record<string, string>;
  }> = [];
  let cursor: string | undefined;
  do {
    const page = await boatRequest(
      creds.apiKey,
      sandboxListResponse,
      "GET",
      `/sandboxes?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    for (const sandbox of page.sandboxes) {
      out.push({
        id: sandbox.id,
        state: sandbox.state,
        labels: labelsFromName(sandbox.name),
      });
    }
    cursor = page.pageInfo?.hasMore
      ? (page.pageInfo.nextCursor ?? undefined)
      : undefined;
  } while (cursor);
  return out;
}

/** Constructs a Boat-backed {@link SandboxClient}. */
export function createBoatClient(creds: BoatCredentials): SandboxClient {
  return new BoatSandboxClient(creds);
}
