"use node";

/**
 * Vercel Sandbox implementation of the provider-neutral contract (./provider.ts),
 * targeting `@vercel/sandbox` v2 (persistent sandboxes, sub-second snapshot
 * restore — see the Phase 0 spike results).
 *
 * Design notes / provider deltas vs Daytona (the original, now-removed provider):
 * - Identity: Vercel addresses sandboxes by `name`, not a separate id. We expose
 *   `handle.id === sandbox.name` and resolve `get(sandboxId)` via `Sandbox.get({ name })`.
 * - Resources: the neutral create params carry no vCPU count, so we default it
 *   (Vercel gives 2 GB RAM per vCPU). Override via SANDBOX_VERCEL_VCPUS if needed.
 * - Lifecycle: Vercel is persistent-by-default and auto-resumes on `get`, so
 *   `start()` is a no-op and `archive()` maps to `stop()` (stop auto-snapshots).
 * - git: no native git client — implemented over the shell via runCommand.
 * - PTY: implemented, but NOT via the neutral `SandboxPty` interface, so
 *   `this.pty` stays undefined here. Vercel's PTY is a client-connect WebSocket
 *   (`openInteractive`) rather than the push-callback model SandboxPty assumes,
 *   so terminals are wired one layer up in ../pty.ts, which returns a
 *   `ptyProtocol: v.literal("vercel")` discriminator and hands the browser a ws
 *   URL. See ../_pty/vercel.ts (tmux-backed shared panes).
 * - desktop: implemented, see VercelDesktop below (TigerVNC + websockify/noVNC).
 * - volumes: the one genuine gap. `ensureVolume` throws — Drives are still beta.
 */

import { Sandbox } from "@vercel/sandbox";
import { Effect } from "effect";
import { z } from "zod";
import { retryAfterDelays, runPromiseRethrowing } from "../_effect/retry";
import { SandboxProviderError } from "./provider";
import type {
  CreateSnapshotParams,
  PreviewUrl,
  SandboxClient,
  SandboxCreateParams,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxDesktop,
  SandboxGit,
  SandboxHandle,
  SandboxProviderKind,
  SandboxSnapshotInfo,
  SandboxState,
} from "./provider";
import {
  KEEP_LAST_SNAPSHOTS,
  vercelSnapshotCreateOptions,
} from "./vercelSnapshotOptions";
import { FFMPEG_INSTALL_SCRIPT } from "./ffmpegInstall";
import { EVA_ENV_FILE } from "./vercelEnvFile";

export {
  EVA_ENV_FILE,
  ensureEvaEnvInteractiveHookScript,
  renderEvaEnvFile,
  tmuxNewSessionWithEvaEnv,
} from "./vercelEnvFile";

/** Vercel API credentials, passed on every SDK call. */
interface VercelCredentials {
  token: string;
  teamId: string;
  projectId: string;
}

const DEFAULT_VCPUS = Number(process.env.SANDBOX_VERCEL_VCPUS ?? "8");
// Vercel caps the create-time `env` payload at 4 KB, but eva injects the full
// repo/team env (~6 KB+). Instead of passing env at create, we write it to this
// file in the sandbox and source it on every exec — no size cap, and it persists
// across get()/resume like any other file.

/** Prefix that sources the eva env file (if present) before a command. */
const SOURCE_ENV = `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE};`;
/** Vercel exposes at most 4 ports; default assumes Next on 3000 + Supabase API. */
const MAX_PORTS = 4;
const STOP_CONFIRMATION_TIMEOUT_MS = 180_000;
const STOP_CONFIRMATION_POLL_MS = 1_000;
/**
 * Ceiling on the snapshot-registration POST. Deliberately far above its normal
 * few-seconds latency: this catches a wedged request, not a slow capture (the
 * capture runs server-side after the POST returns). See createSnapshot.
 */
const SNAPSHOT_REQUEST_TIMEOUT_MS = 120_000;
export const VERCEL_DEFAULT_EXPOSED_PORTS: ReadonlyArray<number> = [
  3000, 8080, 6080, 54321,
];

/** Maps Vercel's session status onto the neutral {@link SandboxState}. */
function normalizeState(raw: string | undefined): SandboxState {
  switch (raw) {
    case "running":
      return "running";
    case "stopped":
      return "stopped";
    // Mid-stop / snapshot must NOT look like idle-stopped. Callers that treat
    // "stopped" as "safe to resume" (ensureSandboxRunning → start) would wait
    // the stop out and then wake the VM — the auto-restart bug after Stop.
    case "stopping":
    case "snapshotting":
      return "starting";
    case "starting":
    case "pending":
      return "starting";
    case "failed":
    case "error":
      return "error";
    case "aborted":
    case "destroying":
    case "destroyed":
      return "gone";
    default:
      return "unknown";
  }
}

/** Maps a Vercel snapshot status onto the neutral snapshot status. */
function normalizeSnapshotStatus(raw: string): SandboxSnapshotInfo["status"] {
  if (raw === "created") return "ready";
  if (raw === "failed") return "error";
  return "pending";
}

/**
 * Extracts a human-readable detail string from a Vercel SDK APIError (or any
 * thrown value). The SDK's `APIError` carries `.json` and `.text` fields with
 * the actual API response body — these are far more useful than the generic
 * "Status code 4xx is not ok" message that otherwise appears in logs.
 *
 * `JSON.stringify(e, Object.getOwnPropertyNames(e))` serialises ALL own
 * properties (including non-enumerable ones like `json`, `text`, `message`)
 * without any type assertions.
 */
function extractApiErrorDetail(e: unknown): string {
  if (e === null || typeof e !== "object") return String(e);
  try {
    return JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 1000);
  } catch {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * The SDK's `APIError` (dist/api-client/api-error.ts) carries the raw fetch
 * `Response`; its auth client throws `NotOk` (dist/auth/error.ts) with
 * `response.statusCode`. Both are dropped by `JSON.stringify`, so the status
 * has to be lifted out before the error is wrapped.
 */
const vercelApiErrorShape = z.object({
  response: z.object({ status: z.number().int() }),
});
const vercelNotOkShape = z.object({
  name: z.literal("NotOk"),
  response: z.object({ statusCode: z.number().int() }),
});

/** Structured HTTP status from a thrown Vercel SDK error, when it has one. */
function vercelHttpStatus(e: unknown): number | undefined {
  const notOk = vercelNotOkShape.safeParse(e);
  if (notOk.success) return notOk.data.response.statusCode;
  const api = vercelApiErrorShape.safeParse(e);
  if (api.success) return api.data.response.status;
  return undefined;
}

/**
 * Wraps a provider-client failure with eva's context while preserving the
 * structured status. `message` may safely carry command text (it is only
 * logged); `detail` stays limited to the provider's own response body, because
 * that is the only field callers are allowed to pattern-match.
 */
function providerError(message: string, e: unknown): SandboxProviderError {
  const detail = extractApiErrorDetail(e);
  return new SandboxProviderError({
    message: `${message}: ${detail}`,
    httpStatus: vercelHttpStatus(e),
    detail,
  });
}

/** True when the Vercel command NDJSON stream died while the VM is still up. */
function isVercelCommandStreamClosed(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes("stream was closed") ||
    lower.includes("not accepting commands") ||
    lower.includes("stream_ended_early") ||
    lower.includes("stream ended before")
  );
}

/** Vercel git operations, implemented over the shell (no native git client). */
class VercelGit implements SandboxGit {
  constructor(private readonly handle: VercelSandboxHandle) {}

  private async sh(cmd: string): Promise<string> {
    // Goes through handle.exec so stream-closed refresh+retry applies.
    const result = await this.handle.exec(cmd);
    if (result.exitCode !== 0) {
      throw new Error(
        `git shell failed (exit ${result.exitCode}): ${cmd}\n${result.output.slice(-2000)}`,
      );
    }
    return result.output;
  }

  async branches(workspaceDir: string): Promise<{ branches: string[] }> {
    const out = await this.sh(
      `cd ${workspaceDir} && git branch --format='%(refname:short)'`,
    );
    const branches = out
      .split("\n")
      .map((b) => b.trim())
      .filter((b) => b.length > 0);
    return { branches };
  }

  async clone(
    url: string,
    dest: string,
    authUser: string,
    authToken: string,
  ): Promise<void> {
    // Inject credentials into the https URL (never logged). Falls back to the
    // bare URL if it is not an https github URL.
    const authed = url.startsWith("https://")
      ? url.replace("https://", `https://${authUser}:${authToken}@`)
      : url;
    await this.sh(`git clone ${authed} ${dest}`);
  }

  async checkoutBranch(
    workspaceDir: string,
    branchName: string,
  ): Promise<void> {
    await this.sh(`cd ${workspaceDir} && git checkout ${branchName}`);
  }
}

/**
 * Vercel desktop operations, aligned with timolins/vercel-sandbox-gui:
 * TigerVNC (Xvnc :1) + websockify + noVNC. Amazon Linux 2023 has no usable
 * window-manager packages (openbox/fluxbox/icewm are absent), so we follow the
 * GUI reference and run Chrome directly on the Xvnc display — no WM required.
 *
 * Critical: long-running Xvnc/websockify MUST use native `detached: true`
 * (execDetached). Backgrounding with `setsid … &` OR plain `&` inside a
 * synchronous runCommand leaves zombies (ppid=1, state Z) once that command
 * exits — HTTP may briefly answer then the RFB WebSocket hangs on noVNC
 * "Loading". Detached commands survive the launcher exiting.
 */
class VercelDesktop implements SandboxDesktop {
  constructor(private readonly handle: VercelSandboxHandle) {}

  async start(): Promise<void> {
    // ffmpeg: required by `agent-browser record` (WebM encode). Runs BEFORE the
    // health/install logic below because older snapshots bake the VNC stack but
    // not ffmpeg — both the healthy early-return and the INSTALLED=1 guard would
    // skip it forever, so a broken encoder would never get repaired.
    // Idempotent and soft-failing; see FFMPEG_INSTALL_SCRIPT.
    await this.handle.exec(FFMPEG_INSTALL_SCRIPT, { timeoutSeconds: 180 });

    // Idempotent: if a live (non-zombie) stack is already healthy, keep it.
    // Re-killing a working Xvnc mid-session blacks the Computer tab and races
    // Chrome relaunch. websockify listens on 16080 (internal); exposed 6080 is
    // the auth preview proxy (see getPreviewUrl / VERCEL_DESKTOP_INTERNAL_PORT).
    const healthy = await this.handle.exec(
      [
        "ps -eo pid,stat,cmd | awk '$2 !~ /Z/ && /Xvnc/ { xvnc=1 } $2 !~ /Z/ && /websockify/ { ws=1 } END { exit(xvnc && ws ? 0 : 1) }'",
        "&& (curl -fsS http://127.0.0.1:16080/vnc_lite.html >/dev/null 2>&1 || curl -fsS http://127.0.0.1:16080/vnc.html >/dev/null 2>&1)",
        "&& xprop -display :1 -root >/dev/null 2>&1",
      ].join(" "),
      { timeoutSeconds: 15 },
    );
    if (healthy.exitCode === 0) {
      return;
    }

    // 1) Install + kill previous servers (sync).
    await this.handle.exec(
      [
        'NOVNC_DIR=""',
        "if [ -d /opt/novnc ]; then NOVNC_DIR=/opt/novnc; elif [ -d /opt/noVNC ]; then NOVNC_DIR=/opt/noVNC; fi",
        "INSTALLED=0",
        'if command -v Xvnc >/dev/null 2>&1 && command -v websockify >/dev/null 2>&1 && [ -n "$NOVNC_DIR" ]; then INSTALLED=1; fi',
        'if [ "$INSTALLED" != "1" ]; then',
        "  sudo dnf install -y tigervnc-server python3 python3-pip xorg-x11-utils xterm dbus-x11 procps-ng psmisc git >/tmp/desktop-dnf.log 2>&1",
        "  sudo dnf install -y gtk3 nss alsa-lib libXScrnSaver libXtst at-spi2-core libdrm mesa-libgbm libxkbcommon libXdamage libXcomposite libXrandr libXcursor libXinerama cups-libs >/tmp/desktop-gui-dnf.log 2>&1 || true",
        "  sudo python3 -m pip install --break-system-packages websockify >/tmp/websockify-pip.log 2>&1 || python3 -m pip install --user websockify >/tmp/websockify-pip.log 2>&1",
        "  command -v websockify >/dev/null 2>&1 || sudo ln -sf $(python3 -m site --user-base)/bin/websockify /usr/local/bin/websockify || true",
        '  if [ -z "$NOVNC_DIR" ]; then sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc >/tmp/novnc-git.log 2>&1; NOVNC_DIR=/opt/novnc; fi',
        "fi",
        "if ! command -v google-chrome-stable >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then",
        "  sudo tee /etc/yum.repos.d/google-chrome.repo >/dev/null <<'EOF'",
        "[google-chrome]",
        "name=google-chrome",
        "baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64",
        "enabled=1",
        "gpgcheck=1",
        "gpgkey=https://dl.google.com/linux/linux_signing_key.pub",
        "EOF",
        "  sudo dnf install -y google-chrome-stable >/tmp/chrome-dnf.log 2>&1 || sudo dnf install -y chromium >/tmp/chromium-dnf.log 2>&1 || true",
        "fi",
        "mkdir -p /home/eva/.vnc /tmp",
        "sudo mkdir -p /tmp/.X11-unix && sudo chmod 1777 /tmp/.X11-unix",
        "pkill -9 -x Xvnc 2>/dev/null || true",
        "pkill -9 -x x0vncserver 2>/dev/null || true",
        "pkill -9 -f '[w]ebsockify' 2>/dev/null || true",
        "fuser -k 16080/tcp 5901/tcp 2>/dev/null || true",
        "rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true",
        "sleep 1",
      ].join("\n"),
      { timeoutSeconds: 240 },
    );

    // 2) Detach Xvnc so it outlives this action.
    await this.handle.execDetached(
      "rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true; Xvnc :1 -geometry ${VNC_RESOLUTION:-1920x1080} -depth 24 -SecurityTypes None -AlwaysShared=1 >/tmp/xvnc.log 2>&1",
    );

    // 3) Wait for the display, then detach websockify on the INTERNAL port.
    // Exposed 6080 is reserved for the auth preview proxy (open-in-new-tab gate).
    await this.handle.exec(
      [
        "for i in $(seq 1 30); do xprop -display :1 -root >/dev/null 2>&1 && break; sleep 0.5; done",
        "xprop -display :1 -root >/dev/null 2>&1",
        "command -v xsetroot >/dev/null 2>&1 && DISPLAY=:1 xsetroot -solid '#1a1a1a' || true",
      ].join("\n"),
      { timeoutSeconds: 60 },
    );

    await this.handle.execDetached(
      [
        'NOVNC_DIR=""; if [ -d /opt/novnc ]; then NOVNC_DIR=/opt/novnc; elif [ -d /opt/noVNC ]; then NOVNC_DIR=/opt/noVNC; fi',
        'WEBSOCKIFY_BIN="$(command -v websockify || echo "$(python3 -m site --user-base)/bin/websockify")"',
        'exec "$WEBSOCKIFY_BIN" --web="$NOVNC_DIR" 127.0.0.1:16080 127.0.0.1:5901 >/tmp/novnc.log 2>&1',
      ].join("; "),
    );

    // 4) Health-check: live (non-zombie) websockify + HTTP 200 on internal port.
    await this.handle.exec(
      [
        "for i in $(seq 1 30); do",
        "  if ps -eo pid,stat,cmd | awk '$2 !~ /Z/ && /websockify/ { found=1 } END { exit(found ? 0 : 1) }' \\",
        "    && (curl -fsS http://127.0.0.1:16080/vnc_lite.html >/dev/null 2>&1 || curl -fsS http://127.0.0.1:16080/vnc.html >/dev/null 2>&1); then",
        "    exit 0",
        "  fi",
        "  sleep 0.5",
        "done",
        'echo "desktop start: websockify/noVNC not healthy" >&2',
        "tail -40 /tmp/novnc.log >&2 || true",
        "tail -20 /tmp/xvnc.log >&2 || true",
        "exit 1",
      ].join("\n"),
      { timeoutSeconds: 60 },
    );
  }

  async stop(): Promise<void> {
    await this.handle.exec(
      [
        "pkill -9 -x Xvnc 2>/dev/null || true",
        "pkill -9 -x x0vncserver 2>/dev/null || true",
        "pkill -9 -f '[w]ebsockify' 2>/dev/null || true",
        "fuser -k 16080/tcp 5901/tcp 2>/dev/null || true",
        "pkill -f '[X]vfb :0' 2>/dev/null || true",
      ].join("; "),
      { timeoutSeconds: 30 },
    );
  }
}

/** A handle to one Vercel sandbox, exposing the neutral {@link SandboxHandle}. */
class VercelSandboxHandle implements SandboxHandle {
  readonly desktop: SandboxDesktop;

  constructor(
    private sandbox: Sandbox,
    private readonly creds: VercelCredentials,
  ) {
    this.desktop = new VercelDesktop(this);
  }

  /** Fresh git facade bound to the current session (refresh() swaps the sandbox). */
  get git(): SandboxGit {
    return new VercelGit(this);
  }

  /** Migration escape hatch (see unwrapVercelSandbox). */
  unwrap(): Sandbox {
    return this.sandbox;
  }

  get id(): string {
    return this.sandbox.name;
  }
  get cpu(): number | undefined {
    return this.sandbox.vcpus;
  }
  get memory(): number | undefined {
    return this.sandbox.memory;
  }
  get disk(): number | undefined {
    // Vercel does not report a per-sandbox disk figure (fixed 32 GB ephemeral NVMe).
    return undefined;
  }
  get state(): SandboxState {
    // `Sandbox.status` reads currentSession(), which THROWS when the record
    // was fetched with resume:false and the sandbox has no live session.
    // Do NOT map that throw to "stopped": mid-stop Vercel often omits the
    // session from get(), and treating it as idle-stopped made
    // ensureSandboxRunning → start(resume:true) wait out the stop and wake
    // the VM. Prefer "starting" so callers go through start(), which polls
    // listSessions and refuses resume while stop is in flight.
    try {
      return normalizeState(this.sandbox.status);
    } catch {
      return "starting";
    }
  }
  get errorReason(): string | null {
    // Vercel surfaces failure via status, not a reason string.
    return null;
  }

  /**
   * See {@link SandboxHandle.classifyForReconcile}. Uses listSessions when the
   * attached session is missing so a hard-timeouted VM is "dead", not the
   * fake "starting" {@link state} reports on throw.
   */
  async classifyForReconcile(): Promise<"alive" | "dead" | "transient"> {
    const resolved = await this.resolveSessionStatus();
    if (resolved.kind === "unknown") return "transient";
    if (resolved.kind === "empty") return "dead";
    const status = resolved.status;
    if (status === "running") return "alive";
    if (this.isTerminalStopStatus(status)) return "dead";
    if (this.isStopInFlightStatus(status)) return "transient";
    if (status === "pending" || status === "starting") return "transient";
    const normalized = normalizeState(status);
    if (normalized === "running") return "alive";
    if (
      normalized === "stopped" ||
      normalized === "archived" ||
      normalized === "gone" ||
      normalized === "error"
    ) {
      return "dead";
    }
    return "transient";
  }

  /**
   * Returns Vercel's un-normalized session status, or `null` when the SDK
   * throws (common for `resume: false` mid-transition). Never invent
   * `"stopped"` from a throw — that made stop confirmation exit while Vercel
   * was still `stopping` / snapshotting, so Eva UI flipped to stopped early.
   */
  private rawStatus(): string | null {
    try {
      return this.sandbox.status;
    } catch {
      return null;
    }
  }

  /**
   * Latest session via listSessions. `get(resume:false)` often omits the
   * session object while Vercel is still stopping/snapshotting — the attached
   * handle then throws "No active session", which must not be treated as idle
   * stopped (that caused early UI closed + resume:true auto-restart).
   *
   * Returns:
   * - `{ kind: "status", status, sessionId }` when a session row exists
   * - `{ kind: "empty" }` when the sandbox has no sessions (fully idle)
   * - `{ kind: "error" }` when the list call failed (keep polling)
   */
  private async latestListedSession(): Promise<
    | { kind: "status"; status: string; sessionId: string }
    | { kind: "empty" }
    | { kind: "error" }
  > {
    try {
      const page = await this.sandbox.listSessions({ limit: 1 });
      const sessions = page.sessions;
      if (!sessions || sessions.length === 0) return { kind: "empty" };
      const latest = sessions[0];
      if (
        !latest ||
        typeof latest.status !== "string" ||
        typeof latest.id !== "string"
      ) {
        return { kind: "empty" };
      }
      return {
        kind: "status",
        status: latest.status,
        sessionId: latest.id,
      };
    } catch (e) {
      console.log(
        `[vercel] listSessions failed sandbox=${this.sandbox.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { kind: "error" };
    }
  }

  /**
   * Stops a session by id via the Vercel REST API. Needed when
   * `get(resume:false)` left this handle without an attached session — SDK
   * `sandbox.stop()` then throws "No active session to stop" and our old path
   * only waited, so the VM stayed `running` while Eva eventually marked closed.
   */
  private async stopSessionById(sessionId: string): Promise<void> {
    const url = new URL(
      `https://vercel.com/api/v2/sandboxes/sessions/${sessionId}/stop`,
    );
    url.searchParams.set("teamId", this.creds.teamId);
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.token}`,
        "content-type": "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `vercel stopSession failed sessionId=${sessionId} status=${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
      );
    }
  }

  /**
   * Prefer attached session status; fall back to listSessions when missing.
   * Distinguishes "truly idle" from "unknown / still stopping".
   */
  private async resolveSessionStatus(): Promise<
    { kind: "status"; status: string } | { kind: "empty" } | { kind: "unknown" }
  > {
    const attached = this.rawStatus();
    if (attached !== null) return { kind: "status", status: attached };
    const listed = await this.latestListedSession();
    if (listed.kind === "status") return listed;
    if (listed.kind === "empty") return { kind: "empty" };
    return { kind: "unknown" };
  }

  private isTerminalStopStatus(status: string): boolean {
    return (
      status === "stopped" ||
      status === "failed" ||
      status === "error" ||
      status === "aborted" ||
      status === "destroyed"
    );
  }

  private isStopInFlightStatus(status: string): boolean {
    return status === "stopping" || status === "snapshotting";
  }

  private shouldReissueStop(status: string): boolean {
    return (
      status === "running" || status === "pending" || status === "starting"
    );
  }

  /** Waits for Vercel to finish stopping and snapshotting without resuming it. */
  private async waitForStopConfirmation(): Promise<void> {
    const deadline = Date.now() + STOP_CONFIRMATION_TIMEOUT_MS;
    let resolved = await this.resolveSessionStatus();
    let lastKnown =
      resolved.kind === "status" ? resolved.status : resolved.kind;
    // Require a few consecutive idle readings before treating "no session" as
    // done — a single empty listSessions mid-stop would flip Eva UI early.
    let consecutiveIdle = 0;
    let lastStopReissueAt = 0;

    while (Date.now() < deadline) {
      if (
        resolved.kind === "status" &&
        this.isTerminalStopStatus(resolved.status)
      ) {
        // A terminal status reading is unambiguous — confirm on the first one.
        // (The consecutive-read guard below is only for "empty" listSessions,
        // which can transiently drop the session mid-stop.) Waiting for a
        // second read added a full poll interval of UI lag after Vercel
        // already reported stopped.
        console.log(
          `[vercel] stop confirmed sandbox=${this.sandbox.name} status=${resolved.status}`,
        );
        return;
      } else if (resolved.kind === "empty") {
        consecutiveIdle += 1;
        lastKnown = "empty";
        if (consecutiveIdle >= 3) {
          console.log(
            `[vercel] stop confirmed sandbox=${this.sandbox.name} status=none (no session)`,
          );
          return;
        }
      } else {
        consecutiveIdle = 0;
        if (resolved.kind === "status") lastKnown = resolved.status;
        else lastKnown = resolved.kind;
        if (
          resolved.kind === "status" &&
          this.shouldReissueStop(resolved.status) &&
          Date.now() - lastStopReissueAt >= 5_000
        ) {
          const listed = await this.latestListedSession();
          if (
            listed.kind === "status" &&
            this.shouldReissueStop(listed.status)
          ) {
            lastStopReissueAt = Date.now();
            console.log(
              `[vercel] stop reissued sandbox=${this.sandbox.name} sessionId=${listed.sessionId} status=${listed.status}`,
            );
            await this.stopSessionById(listed.sessionId);
          }
        }
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, STOP_CONFIRMATION_POLL_MS);
      });
      await this.refresh();
      resolved = await this.resolveSessionStatus();
    }

    throw new Error(
      `vercel stop: sandbox ${this.sandbox.name} did not reach a terminal stopped state within ${STOP_CONFIRMATION_TIMEOUT_MS}ms (last status: ${lastKnown})`,
    );
  }

  async exec(
    cmd: string,
    opts?: SandboxExecOptions,
  ): Promise<SandboxExecResult> {
    // One refresh+retry on "stream was closed" — common after resume when the
    // SDK's command stream dies while the VM is still running.
    const maxAttempts = 2;
    let attempt = 0;
    const runOnce = Effect.suspend(() => {
      attempt += 1;
      return Effect.tryPromise({
        try: async () => {
          const finished = await this.sandbox.runCommand({
            cmd: "bash",
            args: ["-lc", `${SOURCE_ENV} ${cmd}`],
            ...(opts?.cwd ? { cwd: opts.cwd } : {}),
            ...(opts?.env ? { env: opts.env } : {}),
            ...(opts?.sudo ? { sudo: true } : {}),
            ...(opts?.timeoutSeconds
              ? { timeoutMs: opts.timeoutSeconds * 1000 }
              : {}),
          });
          const output = await finished.output("both").catch(() => "");
          return { exitCode: finished.exitCode, output };
        },
        // The Vercel SDK throws APIError whose .json / .text fields carry the
        // actual API response body — surface them so 400/422 failures are
        // diagnosable in Convex logs instead of just "Status code 4xx is not ok".
        catch: (e) => ({
          streamClosed: isVercelCommandStreamClosed(extractApiErrorDetail(e)),
          error: providerError(
            `vercel exec failed (cwd=${opts?.cwd ?? "(default)"}, cmd=${cmd.slice(0, 120)})`,
            e,
          ),
        }),
      });
    });

    return await runPromiseRethrowing(
      runOnce.pipe(
        Effect.tapError((failure) =>
          failure.streamClosed && attempt < maxAttempts
            ? Effect.promise(async () => {
                console.log(
                  `[vercel] exec stream closed on ${this.id}; refreshing and retrying (attempt ${attempt}/${maxAttempts})`,
                );
                await this.refresh();
              })
            : Effect.void,
        ),
        Effect.retry({
          schedule: retryAfterDelays([0]),
          while: (failure) => failure.streamClosed,
        }),
        Effect.mapError((failure) => failure.error),
      ),
    );
  }

  async execDetached(cmd: string, opts?: SandboxExecOptions): Promise<void> {
    // Native detached exec: returns a Command handle immediately without holding
    // the stream. This is the analogue of eva's `setsid nohup … &` on Daytona —
    // a shell `&` inside a synchronous runCommand would keep the stream open
    // until it times out (StreamError). The command itself still backgrounds its
    // long-runner with setsid so it survives this launcher process exiting.
    await this.sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", `${SOURCE_ENV} ${cmd}`],
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
      ...(opts?.env ? { env: opts.env } : {}),
      ...(opts?.sudo ? { sudo: true } : {}),
      detached: true,
    });
  }

  async start(
    timeoutSeconds: number,
    opts?: { resumeAfterStop?: boolean },
  ): Promise<void> {
    const resumeAfterStop = opts?.resumeAfterStop === true;
    // Explicit resume via get(resume:true) — the SDK's native resume path (one
    // getSandbox API call that provisions a fresh session, sub-second on warm
    // hosts). The previous exec("true") kick went through withResume, which on
    // a stopping/snapshotting session POLLS THE STOP TO COMPLETION first and
    // paid full command-stream setup — observed ~32s resumes vs ~1s native.
    await this.refresh();
    // Read state into locals: TS narrows the `this.state` getter across the
    // whole function (reassigning this.sandbox does not reset it).
    let observed: SandboxState = this.state;
    if (observed === "running") return;

    // If a stop is in flight, NEVER issue resume:true while it runs — the SDK
    // waits the stop out and then wakes the VM (auto-restart after the user
    // clicked Stop). Wait for a terminal stopped state with resume:false
    // first. What happens next depends on caller intent: explicit
    // user-initiated starts (resumeAfterStop) proceed to resume from the
    // fresh snapshot — e.g. Start clicked while a previous run's teardown was
    // still snapshotting — while background callers refuse, so a stale
    // in-flight resume cannot resurrect a sandbox the user just stopped.
    let resolved = await this.resolveSessionStatus();
    if (
      resolved.kind === "status" &&
      this.isStopInFlightStatus(resolved.status)
    ) {
      console.log(
        `[vercel] start ${resumeAfterStop ? "waiting out in-flight stop" : "refused"} while ${resolved.status} sandbox=${this.sandbox.name}`,
      );
      await this.waitForStopConfirmation();
      if (!resumeAfterStop) {
        throw new Error(
          `vercel start: sandbox ${this.sandbox.name} was stopped while a start was in progress`,
        );
      }
      await this.refresh();
    }

    // Retry loop: a resume issued while a previous stop is still snapshotting
    // is rejected by the API (the SDK's waitForStopAndResume exists for this),
    // so keep re-issuing until the session reports running or we time out.
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastError: string | null = null;
    // Kept alongside `lastError` so the timeout below can be thrown as a
    // structured provider error. Without it the reason the resume kept losing
    // (a 404 for a deleted sandbox vs a 429 for a busy account) survived only
    // as prose inside the timeout message, and callers had to guess by regex.
    let lastErrorStatus: number | undefined;
    let lastErrorDetail: string | null = null;
    while (Date.now() < deadline) {
      resolved = await this.resolveSessionStatus();
      if (
        resolved.kind === "status" &&
        this.isStopInFlightStatus(resolved.status)
      ) {
        console.log(
          `[vercel] start: stop began mid-resume sandbox=${this.sandbox.name}; ${resumeAfterStop ? "waiting it out before resuming" : "aborting"}`,
        );
        await this.waitForStopConfirmation();
        if (!resumeAfterStop) {
          throw new Error(
            `vercel start: sandbox ${this.sandbox.name} was stopped while a start was in progress`,
          );
        }
        await this.refresh();
        continue;
      }
      // Still resolving (listSessions error / race) — do not resume yet.
      if (resolved.kind === "unknown") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.refresh();
        continue;
      }
      try {
        this.sandbox = await Sandbox.get({
          ...this.creds,
          name: this.sandbox.name,
          resume: true,
        });
        observed = this.state;
        if (observed === "running") return;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        lastErrorStatus = vercelHttpStatus(e);
        lastErrorDetail = extractApiErrorDetail(e);
        // SDK may reject resume while stop finishes even if listSessions lagged.
        if (
          lastError.includes("stopping") ||
          lastError.includes("snapshotting")
        ) {
          console.log(
            `[vercel] start hit stop-in-flight API error sandbox=${this.sandbox.name}: ${lastError}`,
          );
          await this.waitForStopConfirmation();
          if (!resumeAfterStop) {
            throw new Error(
              `vercel start: sandbox ${this.sandbox.name} was stopped while a start was in progress`,
            );
          }
          // Stop confirmed terminal — loop around and retry the resume.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.refresh();
    }
    throw new SandboxProviderError({
      message: `vercel start: sandbox ${this.sandbox.name} did not reach running within ${timeoutSeconds}s (state: ${observed}${lastError ? `, last error: ${lastError}` : ""})`,
      httpStatus: lastErrorStatus,
      // No detail when no resume attempt actually failed: a bare deadline
      // (still `starting`) is not evidence the sandbox is gone, and an empty
      // detail cannot match anything.
      detail: lastErrorDetail ?? "",
    });
  }
  async extendTimeout(durationMs: number): Promise<void> {
    // Pushes the hard session deadline out (capped by the plan's max runtime).
    // Called by the stall watchdog while a turn is active so live work is
    // never killed by the create-time `timeout` cap. Best-effort by contract.
    //
    // Sessions are born at the plan ceiling (create floors `timeout` to 24h),
    // and Vercel rejects any extension that would pass that ceiling — so while
    // the deadline is still hours out, every ask is a guaranteed 400. Only ask
    // once the deadline is actually inside the window the caller wants covered.
    // Without this gate a single live turn burned one action + one 400 every
    // 30s for the length of the turn (prod, 2026-08-19: extendSandboxDeadline
    // logging "Status code 400 is not ok" for white-spiritual-cobra-vvQSfA on
    // every watchdog tick).
    const expiresAt = this.sandbox.expiresAt?.getTime();
    if (expiresAt !== undefined && expiresAt - Date.now() > durationMs) return;
    try {
      await this.sandbox.extendTimeout(durationMs);
    } catch (e) {
      // The SDK's message is only the HTTP status; the caller swallows this, so
      // the body is the sole record of WHY a real near-deadline extension lost.
      throw new Error(
        `vercel extendTimeout failed (sandbox=${this.sandbox.name}, durationMs=${durationMs}, sessionTimeout=${this.sandbox.timeout ?? "unknown"}, expiresAt=${expiresAt !== undefined ? new Date(expiresAt).toISOString() : "none"}): ${extractApiErrorDetail(e)}`,
      );
    }
  }

  async stop(): Promise<void> {
    // Prefer the stop API (not runCommand) so a dead command stream cannot
    // block shutdown. Refresh first so we target the current session record.
    // A successful stop request only means Vercel accepted it: the session can
    // remain `stopping` while its snapshot is written. Do not let callers mark
    // the session closed until a side-effect-free `resume: false` read confirms
    // that transition has actually completed.
    await this.refresh();
    const resolved = await this.resolveSessionStatus();
    if (
      resolved.kind === "empty" ||
      (resolved.kind === "status" && this.isTerminalStopStatus(resolved.status))
    ) {
      return;
    }
    // Already mid-stop (user double-clicked, or concurrent stop) — just wait.
    if (
      resolved.kind === "status" &&
      this.isStopInFlightStatus(resolved.status)
    ) {
      console.log(
        `[vercel] stop already in progress sandbox=${this.sandbox.name} status=${resolved.status}`,
      );
      await this.waitForStopConfirmation();
      return;
    }
    // Prefer SDK stop when this handle still has an attached session.
    const attached = this.rawStatus();
    if (attached !== null) {
      console.log(
        `[vercel] stop requested sandbox=${this.sandbox.name} status=${attached}`,
      );
      // stop() auto-snapshots persistent sandboxes — enforce retention first
      // so older sandboxes created before create-time policy still stay at 1.
      await this.ensureSnapshotRetention();
      await this.sandbox.stop();
      await this.waitForStopConfirmation();
      return;
    }
    // get(resume:false) dropped the session object, but listSessions still
    // shows a live/pending session. SDK stop() throws "No active session to
    // stop" here — stop by session id instead of waiting forever on `running`.
    const listed = await this.latestListedSession();
    if (listed.kind !== "status") {
      console.log(
        `[vercel] stop: no attached session and no listed session sandbox=${this.sandbox.name} listed=${listed.kind}; waiting`,
      );
      await this.waitForStopConfirmation();
      return;
    }
    if (this.isTerminalStopStatus(listed.status)) {
      return;
    }
    if (this.isStopInFlightStatus(listed.status)) {
      console.log(
        `[vercel] stop already in progress (listed) sandbox=${this.sandbox.name} status=${listed.status}`,
      );
      await this.waitForStopConfirmation();
      return;
    }
    console.log(
      `[vercel] stop via sessionId sandbox=${this.sandbox.name} sessionId=${listed.sessionId} status=${listed.status}`,
    );
    await this.ensureSnapshotRetention();
    await this.stopSessionById(listed.sessionId);
    await this.waitForStopConfirmation();
  }

  /** Apply keep-last-1 + never-expire so stop/snapshot do not pile up snap_* billing. */
  private async ensureSnapshotRetention(): Promise<void> {
    await this.sandbox.update({
      snapshotExpiration: 0,
      keepLastSnapshots: KEEP_LAST_SNAPSHOTS,
    });
  }
  async archive(): Promise<void> {
    // No separate cold-storage archive on Vercel — stop() auto-snapshots.
    await this.stop();
  }

  /**
   * Delete every snap_* listed for this sandbox name, optionally keeping seed
   * captures. Vercel's sandbox.delete() is documented to cascade, but in
   * practice snap_* objects (especially expiration:0 seed captures) remain and
   * continue to bill Snapshot Storage — see project Snapshots dashboard.
   */
  private async deleteSnapshotsForSandbox(
    sandboxName: string,
    preserveSnapshotIds: ReadonlySet<string>,
  ): Promise<number> {
    const { Snapshot } = await import("@vercel/sandbox");
    // list() yields plain metadata (`id`, no .delete()) — re-hydrate to delete.
    const listed = await Snapshot.list({
      ...this.creds,
      name: sandboxName,
    });
    let deleted = 0;
    for await (const meta of listed) {
      if (preserveSnapshotIds.has(meta.id)) continue;
      // Already soft-deleted tombstones reject DELETE with 400 — skip them.
      if (String(meta.status) === "deleted") continue;
      try {
        const snap = await Snapshot.get({
          ...this.creds,
          snapshotId: meta.id,
        });
        await snap.delete();
        deleted += 1;
      } catch (error) {
        console.warn(
          `[vercel] snapshot.delete failed sandbox=${sandboxName} snapshotId=${meta.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return deleted;
  }

  async delete(options?: {
    preserveSnapshotIds?: ReadonlyArray<string>;
  }): Promise<void> {
    const sandboxName = this.sandbox.name;
    const preserve = new Set(options?.preserveSnapshotIds ?? []);
    const before = await this.deleteSnapshotsForSandbox(sandboxName, preserve);
    try {
      await this.sandbox.delete();
    } catch (error) {
      console.warn(
        `[vercel] sandbox.delete failed name=${sandboxName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // Cascade is unreliable — sweep again for anything left after sandbox gone.
    const after = await this.deleteSnapshotsForSandbox(sandboxName, preserve);
    if (before + after > 0) {
      console.log(
        `[vercel] delete sandbox=${sandboxName} purgedSnapshots=${before + after} preserved=${preserve.size}`,
      );
    }
  }
  async refresh(): Promise<void> {
    // Re-fetch the sandbox to pick up current status. resume:false is CRITICAL:
    // the SDK's `resume` param defaults to TRUE, so a bare get() on a stopped
    // sandbox silently resumes it server-side — status polls (preview checks,
    // stop preflights) were waking sandboxes the user had just stopped. Reads
    // must be side-effect free; only start() resumes explicitly.
    this.sandbox = await Sandbox.get({
      ...this.creds,
      name: this.sandbox.name,
      resume: false,
    });
  }

  async previewUrl(port: number): Promise<PreviewUrl> {
    if (VERCEL_DEFAULT_EXPOSED_PORTS.includes(port)) {
      await this.sandbox.update({ ports: [...VERCEL_DEFAULT_EXPOSED_PORTS] });
      await this.refresh();
    }
    try {
      return { url: this.sandbox.domain(port), port };
    } catch (error) {
      if (!VERCEL_DEFAULT_EXPOSED_PORTS.includes(port)) {
        throw error;
      }
      await this.sandbox.update({ ports: [...VERCEL_DEFAULT_EXPOSED_PORTS] });
      await this.refresh();
      return { url: this.sandbox.domain(port), port };
    }
  }

  async createSnapshot(
    params: CreateSnapshotParams,
  ): Promise<{ snapshotId: string }> {
    // Vercel snapshots are id-addressed (name is ignored for addressing).
    // Retention is also set at create/stop; re-apply here so explicit captures
    // still evict older snap_* objects. snapshotWorkflow separately deletes the
    // previous seeded snapshot by name across sandbox lineages.
    await this.ensureSnapshotRetention();

    // `sandbox.snapshot` is a single POST that registers the snapshot and
    // returns its id; the capture itself continues server-side. It answers in
    // seconds, which is what lets callers poll completion across separate
    // workflow steps instead of awaiting a multi-minute capture inline.
    //
    // The bound below is not a capture timeout — it cannot be, since aborting
    // would discard the very id callers need to poll with. It exists so a wedged
    // request (or a `withResume` that stalls waking a stopped sandbox — the SDK
    // resumes before snapshotting) surfaces a describable error instead of
    // running into Convex's ~600s action ceiling, which kills the action with no
    // message. Aborting is acceptable here only because at this point the action
    // was already doomed.
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SNAPSHOT_REQUEST_TIMEOUT_MS,
    );
    try {
      const snap = await this.sandbox.snapshot({
        expiration: 0,
        signal: controller.signal,
      });
      return { snapshotId: snap.snapshotId };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `vercel createSnapshot (name=${params.name ?? "unnamed"}, sandbox=${this.sandbox.name}) did not return within ${SNAPSHOT_REQUEST_TIMEOUT_MS / 1000}s. This POST only registers the snapshot, so a stall here means the API or the pre-snapshot resume is wedged — not that the capture is slow.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    await this.sandbox.writeFiles([{ path, content }]);
  }
}

/** Vercel-backed provider client, scoped to one set of credentials. */
class VercelSandboxClient implements SandboxClient {
  readonly kind: SandboxProviderKind = "vercel";

  constructor(private readonly creds: VercelCredentials) {}

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    // env is written to a file post-create (see EVA_ENV_FILE) rather than passed
    // here — Vercel's create-time env cap is 4 KB and eva's env exceeds it.
    const persistent = params.lifecycle.ephemeral !== true;
    const base = {
      ...this.creds,
      // Vercel `timeout` is a HARD session cap, not Daytona's idle-stop timer.
      // Mapping a small autoStop (e.g. WARMING's 10 min) straight through would
      // hard-kill a long seed build or agent turn mid-run. Floor it to the Pro
      // plan max (24h) so Start/Stop own the lifecycle; this cap is only a leak
      // backstop. Vercel bills active CPU + provisioned memory while running.
      timeout: Math.max(params.lifecycle.autoStopMinutes, 24 * 60) * 60 * 1000,
      persistent,
      ...vercelSnapshotCreateOptions(persistent),
      resources: { vcpus: DEFAULT_VCPUS },
      ports: (params.ports ?? VERCEL_DEFAULT_EXPOSED_PORTS).slice(0, MAX_PORTS),
      ...(params.lifecycle.labels ? { tags: params.lifecycle.labels } : {}),
    };
    try {
      const sandbox = params.snapshot
        ? await Sandbox.create({
            ...base,
            source: { type: "snapshot", snapshotId: params.snapshot },
          })
        : params.image
          ? // VCR image boot. `image` and the legacy `runtime` are mutually
            // exclusive in the SDK types, hence the separate call.
            await Sandbox.create({ ...base, image: params.image })
          : await Sandbox.create({ ...base, runtime: "node24" });
      console.log(
        `[vercel] created sandbox=${sandbox.name} persistent=${persistent} sourceSnapshot=${params.snapshot ?? "none"} image=${params.image ?? "none"}`,
      );
      // Env is NOT written here. writeFiles is the first sandbox I/O and absorbs
      // Vercel's first-command boot penalty (seconds–tens of seconds). Callers
      // (createSandbox) fire onSandboxAcquired first, then write EVA_ENV_FILE.
      // Fresh node24 sandboxes don't include /tmp/repo. Every execHandle call
      // defaults to that cwd (WORKSPACE_DIR = "/tmp/repo" in helpers.ts), so
      // any command with no explicit cwd returns HTTP 400 until the directory
      // exists. Pre-create it here so git config / ensureDockerDaemon calls in
      // createSandbox succeed. Snapshot-restored sandboxes already have the
      // directory baked in, so this is only needed for fresh ones.
      if (!params.snapshot) {
        await sandbox.mkDir("/tmp/repo");
      }
      return new VercelSandboxHandle(sandbox, this.creds);
    } catch (e) {
      // The SDK's message is just the HTTP status; surface the API body + the
      // params we sent (env values redacted) so a create failure is diagnosable.
      const detail = extractApiErrorDetail(e);
      throw new Error(
        `vercel create failed (snapshot=${params.snapshot ?? "none"}, image=${params.image ?? "none"}, timeout=${base.timeout}, persistent=${base.persistent}, vcpus=${DEFAULT_VCPUS}, envKeys=[${Object.keys(params.envVars ?? {}).join(",")}], hasTags=${Boolean(params.lifecycle.labels)}): ${detail}`,
      );
    }
  }

  async get(sandboxId: string): Promise<SandboxHandle> {
    // resume:false — the SDK default (true) silently RESUMES a stopped sandbox
    // on lookup, so status checks / preview polls were waking sandboxes the
    // user had just stopped. Resume happens only via handle.start() or lazily
    // on the first exec (the SDK's withResume).
    const sandbox = await Sandbox.get({
      ...this.creds,
      name: sandboxId,
      resume: false,
    });
    return new VercelSandboxHandle(sandbox, this.creds);
  }

  async getSnapshot(ref: string): Promise<SandboxSnapshotInfo | null> {
    try {
      const { Snapshot } = await import("@vercel/sandbox");
      const snap = await Snapshot.get({ ...this.creds, snapshotId: ref });
      return {
        id: snap.snapshotId,
        status: normalizeSnapshotStatus(String(snap.status)),
        errorReason: null,
        raw: String(snap.status),
      };
    } catch {
      return null;
    }
  }

  async deleteSnapshot(ref: string): Promise<boolean> {
    try {
      const { Snapshot } = await import("@vercel/sandbox");
      const snap = await Snapshot.get({ ...this.creds, snapshotId: ref });
      await snap.delete();
      return true;
    } catch {
      return false;
    }
  }

  async ensureVolume(_name: string): Promise<{ id: string; ready: boolean }> {
    // Persistent named volumes map to Vercel Drives (beta) — not wired yet.
    throw new Error(
      "Vercel provider does not implement named volumes yet (Drives, beta — Phase 2 follow-up).",
    );
  }
}

/** Recovers the underlying Vercel sandbox from a handle (PTY, etc.). */
export function unwrapVercelSandbox(handle: SandboxHandle): Sandbox {
  if (handle instanceof VercelSandboxHandle) {
    return handle.unwrap();
  }
  throw new Error("Expected a Vercel-backed sandbox handle.");
}

/** Constructs a Vercel-backed {@link SandboxClient} from access-token credentials. */
export function createVercelClient(creds: VercelCredentials): SandboxClient {
  return new VercelSandboxClient(creds);
}
