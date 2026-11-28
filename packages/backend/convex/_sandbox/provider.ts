/** Which backend fulfils sandbox operations. Vercel is the only implementation. */
export type SandboxProviderKind = "vercel";

/**
 * Coarse sandbox lifecycle state, normalised across providers.
 *
 * Vercel exposes: running/stopped/stopping/snapshotting/pending/failed/aborted.
 * The adapter maps its native state onto these buckets; `raw` carries the
 * provider's original string for logging and edge-case checks.
 */
export type SandboxState =
  | "running"
  | "stopped"
  | "archived"
  | "restoring"
  | "starting"
  | "error"
  | "gone"
  | "unknown";

/** Result of a one-shot command execution. `output` is combined stdout (stderr on failure paths). */
export interface SandboxExecResult {
  exitCode: number;
  output: string;
}

/** Options for a one-shot command execution. */
export interface SandboxExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutSeconds?: number;
  sudo?: boolean;
}

/**
 * Lifecycle policy applied at create time. Neutral, minute-based.
 * Vercel maps `autoStopMinutes` to the session `timeout`, `autoArchiveMinutes`
 * to snapshot expiration, and `ephemeral` to `persistent: false`.
 */
export interface SandboxLifecycleParams {
  autoStopMinutes: number;
  autoArchiveMinutes?: number;
  autoDeleteMinutes?: number;
  ephemeral?: boolean;
  labels?: Record<string, string>;
}

/**
 * A persistent named volume to attach at create time, keyed by mount path.
 *
 * `read-write` takes an exclusive lock on the volume — at most one sandbox may
 * hold it. `snapshot` mounts a read-only view frozen at mount time and has no
 * such limit. Vercel fulfils these with Drives; see `./driveCache.ts` for the
 * policy that decides which role a sandbox gets.
 */
export interface SandboxMount {
  path: string;
  volumeName: string;
  mode: "read-write" | "snapshot";
}

/**
 * A project coordinator's sandbox size (plan decision 22): 2 vCPU, 4 GB on
 * Vercel. It only reads code and plans, so it runs no dev server. Raise it if
 * a large repo runs out of memory; the app's size setting does not apply.
 */
export const COORDINATOR_VCPUS = 2;

/** Parameters to create a sandbox, optionally seeded from a snapshot. */
export interface SandboxCreateParams {
  snapshot?: string;
  forkFrom?: string;
  image?: string;
  envVars: Record<string, string>;
  lifecycle: SandboxLifecycleParams;
  ports?: number[];
  readyTimeoutSeconds?: number;
  mounts?: SandboxMount[];
  vcpus?: number;
}

/** Narrowed view of a snapshot record. */
export interface SandboxSnapshotInfo {
  id: string;
  status: "ready" | "pending" | "error";
  errorReason: string | null;
  raw: string;
}

/** Parameters to capture a snapshot from a running sandbox. */
export interface CreateSnapshotParams {
  name?: string;
}

/** A signed/public preview URL for a port inside the sandbox. */
export interface PreviewUrl {
  url: string;
  port: number;
}

/** In-sandbox git operations, backed by shell git. */
export interface SandboxGit {
  branches(workspaceDir: string): Promise<{ branches: string[] }>;
  clone(
    url: string,
    dest: string,
    authUser: string,
    authToken: string,
  ): Promise<void>;
  checkoutBranch(workspaceDir: string, branchName: string): Promise<void>;
}

/** Desktop / ComputerUse capability (Xvfb + browser for vision tasks). */
export interface SandboxDesktop {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * A handle to a single running (or resumable) sandbox. Wraps the provider's
 * per-instance SDK object. Property getters expose identity and normalised
 * state; methods cover the lifecycle and I/O eva actually uses.
 */
export interface SandboxHandle {
  readonly id: string;
  readonly cpu?: number;
  readonly memory?: number;
  readonly disk?: number;

  readonly state: SandboxState;
  readonly errorReason: string | null;

  classifyForReconcile(): Promise<"alive" | "dead" | "transient">;

  exec(cmd: string, opts?: SandboxExecOptions): Promise<SandboxExecResult>;

  execDetached(cmd: string, opts?: SandboxExecOptions): Promise<void>;

  writeFile(path: string, content: string | Uint8Array): Promise<void>;

  start(
    timeoutSeconds: number,
    opts?: { resumeAfterStop?: boolean },
  ): Promise<void>;
  stop(): Promise<void>;
  archive(): Promise<void>;
  extendTimeout(durationMs: number): Promise<void>;
  delete(options?: {
    preserveSnapshotIds?: ReadonlyArray<string>;
  }): Promise<void>;
  refresh(): Promise<void>;

  previewUrl(port: number, ttlSeconds?: number): Promise<PreviewUrl>;

  createSnapshot(params: CreateSnapshotParams): Promise<{ snapshotId: string }>;

  readonly git: SandboxGit;

  readonly desktop?: SandboxDesktop;
}

/**
 * A provider client scoped to one set of credentials. Owns sandbox creation,
 * lookup, and account-level snapshot operations.
 */
export interface SandboxClient {
  readonly kind: SandboxProviderKind;

  create(params: SandboxCreateParams): Promise<SandboxHandle>;
  get(sandboxId: string): Promise<SandboxHandle>;

  getSnapshot(ref: string): Promise<SandboxSnapshotInfo | null>;
  deleteSnapshot(ref: string): Promise<boolean>;
}

/** Credentials for the active provider. */
export type SandboxCredentials = {
  kind: "vercel";
  token: string;
  teamId: string;
  projectId: string;
  vcpus: number;
};

/**
 * A failure of the *provider client itself* — the HTTP call to the sandbox API
 * failed, not a command inside a sandbox.
 *
 * Adapters throw this instead of a bare `Error` so the structured part of the
 * SDK's failure (HTTP status) survives being wrapped with eva's context. The
 * SDK's own message is only the status line ("Status code 404 is not ok") and
 * `JSON.stringify` drops a fetch `Response`, so without this the status was
 * lost and the only remaining signal was substring-matching prose.
 *
 * This type is also the gate for message-based classification: only a
 * `SandboxProviderError`'s {@link detail} may be pattern-matched, which is what
 * makes it impossible for in-sandbox command output to be read as "the sandbox
 * is gone". See `_sandbox_runtime/sandboxErrors.ts`.
 */
export class SandboxProviderError extends Error {
  readonly httpStatus: number | undefined;
  readonly detail: string;

  constructor(
    message: string,
    options: { httpStatus?: number; detail: string },
  ) {
    super(message);
    this.name = "SandboxProviderError";
    this.httpStatus = options.httpStatus;
    this.detail = options.detail;
  }
}
