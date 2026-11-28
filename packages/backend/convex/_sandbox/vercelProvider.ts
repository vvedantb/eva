"use node";

import { Drive, Sandbox } from "@vercel/sandbox";
import type { SandboxMounts, SandboxRegion } from "@vercel/sandbox";
import { z } from "zod";
import { DEFAULT_PREVIEW_PORT, DESKTOP_PORT, EDITOR_PORT } from "@eva/shared";
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
  SandboxMount,
  SandboxProviderKind,
  SandboxSnapshotInfo,
  SandboxState,
} from "./provider";
import {
  KEEP_LAST_SNAPSHOTS,
  vercelSnapshotCreateOptions,
} from "./vercelSnapshotOptions";
import { driveCacheSetupScript, driveCacheTeardownScript } from "./driveCache";
import { FFMPEG_INSTALL_SCRIPT } from "./ffmpegInstall";
import { snapshotPruneScript } from "./snapshotPrune";
import { foreignSandboxDeployment } from "./tags";
import { EVA_ENV_SOURCE_CMD } from "./vercelEnvFile";
import { SANDBOX_REGION, sandboxPlacement } from "./vercelRegion";
import {
  CHROME_RUNTIME_LIBRARY_PACKAGES,
  PACKAGE_HELPER_SCRIPT,
  pkgInstall,
} from "../_sandbox_runtime/packageManager";
import { errorMessage } from "@vvedantb/server";

export {
  EVA_ENV_FILE,
  ensureEvaEnvInteractiveHookScript,
  renderEvaEnvFile,
  tmuxNewSessionWithEvaEnv,
} from "./vercelEnvFile";

interface VercelCredentials {
  token: string;
  teamId: string;
  projectId: string;
}

const VERCEL_SANDBOX_IMAGE = "vercel/sandbox/universal:latest";

const SOURCE_ENV = `${EVA_ENV_SOURCE_CMD};`;
const MAX_PORTS = 4;
const STOP_CONFIRMATION_TIMEOUT_MS = 180_000;
const STOP_CONFIRMATION_POLL_MS = 1_000;
const SNAPSHOT_REQUEST_TIMEOUT_MS = 120_000;
export const VERCEL_DEFAULT_EXPOSED_PORTS: ReadonlyArray<number> = [
  DEFAULT_PREVIEW_PORT,
  EDITOR_PORT,
  DESKTOP_PORT,
  54321,
];
const DRIVE_MAX_SIZE_BYTES =
  Number(process.env.SANDBOX_VERCEL_DRIVE_MAX_GIB ?? "64") * 1024 ** 3;

function normalizeState(raw: string | undefined): SandboxState {
  switch (raw) {
    case "running":
      return "running";
    case "stopped":
      return "stopped";
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

function normalizeSnapshotStatus(raw: string): SandboxSnapshotInfo["status"] {
  if (raw === "created") return "ready";
  if (raw === "failed") return "error";
  return "pending";
}

function extractApiErrorDetail(e: unknown): string {
  if (e === null || typeof e !== "object") return String(e);
  try {
    return JSON.stringify(e, Object.getOwnPropertyNames(e)).slice(0, 1000);
  } catch {
    return errorMessage(e);
  }
}

const vercelApiErrorShape = z.object({
  response: z.object({ status: z.number().int() }),
});
const vercelNotOkShape = z.object({
  name: z.literal("NotOk"),
  response: z.object({ statusCode: z.number().int() }),
});

function vercelHttpStatus(e: unknown): number | undefined {
  const notOk = vercelNotOkShape.safeParse(e);
  if (notOk.success) return notOk.data.response.statusCode;
  const api = vercelApiErrorShape.safeParse(e);
  if (api.success) return api.data.response.status;
  return undefined;
}

function providerError(message: string, e: unknown): SandboxProviderError {
  const detail = extractApiErrorDetail(e);
  return new SandboxProviderError(`${message}: ${detail}`, {
    httpStatus: vercelHttpStatus(e),
    detail,
  });
}

function isRetryableExecFailure(detail: string): boolean {
  const lower = detail.toLowerCase();
  return (
    lower.includes("stream was closed") ||
    lower.includes("not accepting commands") ||
    lower.includes("stream_ended_early") ||
    lower.includes("stream ended before") ||
    lower.includes("fetch failed") ||
    lower.includes("und_err_socket") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up")
  );
}

class VercelGit implements SandboxGit {
  constructor(private readonly handle: VercelSandboxHandle) {}

  private async sh(cmd: string): Promise<string> {
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

class VercelDesktop implements SandboxDesktop {
  constructor(private readonly handle: VercelSandboxHandle) {}

  async start(): Promise<void> {
    await this.handle.exec(FFMPEG_INSTALL_SCRIPT, { timeoutSeconds: 180 });

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

    await this.handle.exec(
      [
        PACKAGE_HELPER_SCRIPT,
        'NOVNC_DIR=""',
        "if [ -d /opt/novnc ]; then NOVNC_DIR=/opt/novnc; elif [ -d /opt/noVNC ]; then NOVNC_DIR=/opt/noVNC; fi",
        "INSTALLED=0",
        'if command -v Xvnc >/dev/null 2>&1 && command -v websockify >/dev/null 2>&1 && [ -n "$NOVNC_DIR" ]; then INSTALLED=1; fi',
        'if [ "$INSTALLED" != "1" ]; then',
        `  ${pkgInstall("vnc-server", "vnc-common", "python3", "python3-pip", "x11-utils", "x11-xserver-utils", "xterm", "dbus-x11", "procps", "psmisc", "git")} || true`,
        `  ${pkgInstall(...CHROME_RUNTIME_LIBRARY_PACKAGES)} || true`,
        "  sudo python3 -m pip install --break-system-packages websockify >/tmp/websockify-pip.log 2>&1 || python3 -m pip install --user websockify >/tmp/websockify-pip.log 2>&1",
        "  command -v websockify >/dev/null 2>&1 || sudo ln -sf $(python3 -m site --user-base)/bin/websockify /usr/local/bin/websockify || true",
        '  if [ -z "$NOVNC_DIR" ]; then sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc >/tmp/novnc-git.log 2>&1; NOVNC_DIR=/opt/novnc; fi',
        "fi",
        "eva_pkg_install_chrome || true",
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

    await this.handle.execDetached(
      "rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true; Xvnc :1 -geometry ${VNC_RESOLUTION:-1920x1080} -depth 24 -SecurityTypes None -AlwaysShared=1 >/tmp/xvnc.log 2>&1",
    );

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

async function rewireDriveCacheOnResume(sandbox: Sandbox): Promise<void> {
  try {
    const finished = await sandbox.runCommand({
      cmd: "bash",
      args: ["-lc", driveCacheSetupScript()],
      timeoutMs: 60_000,
    });
    console.log(
      `[vercel] drive cache re-wired after resume sandbox=${sandbox.name} exit=${finished.exitCode}`,
    );
  } catch (e) {
    console.warn(
      `[vercel] drive cache re-wire after resume failed sandbox=${sandbox.name} (continuing, cache cold): ${extractApiErrorDetail(e)}`,
    );
  }
}

function describeMounts(mounts: SandboxMounts | undefined): string {
  if (!mounts) return "none";
  return Object.entries(mounts)
    .map(
      ([path, value]) =>
        `${path}=${value instanceof Drive ? "read-write" : value.mode}`,
    )
    .join(",");
}

function demoteMounts(
  mounts: SandboxMounts,
  paths: ReadonlySet<string>,
): SandboxMounts {
  const out: SandboxMounts = {};
  for (const [path, value] of Object.entries(mounts)) {
    out[path] =
      value instanceof Drive && paths.has(path) ? value.snapshot() : value;
  }
  return out;
}

function mountFallbackLadder(
  mounts: SandboxMounts | undefined,
): ReadonlyArray<SandboxMounts | undefined> {
  if (!mounts) return [undefined];
  const readWritePaths = Object.entries(mounts)
    .filter(([, value]) => value instanceof Drive)
    .map(([path]) => path);
  const stages: Array<SandboxMounts | undefined> = [mounts];
  if (readWritePaths.length > 1) {
    for (const path of [...readWritePaths].reverse()) {
      stages.push(demoteMounts(mounts, new Set([path])));
    }
  }
  if (readWritePaths.length > 0) {
    stages.push(demoteMounts(mounts, new Set(readWritePaths)));
  }
  stages.push(undefined);
  return stages;
}

function withoutLazyResume(sandbox: Sandbox): Sandbox {
  sandbox.setAutoResume(false);
  return sandbox;
}

class VercelSandboxHandle implements SandboxHandle {
  readonly desktop: SandboxDesktop;
  private sandbox: Sandbox;

  constructor(
    sandbox: Sandbox,
    private readonly creds: VercelCredentials,
  ) {
    this.sandbox = withoutLazyResume(sandbox);
    this.desktop = new VercelDesktop(this);
  }

  get git(): SandboxGit {
    return new VercelGit(this);
  }

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
    return undefined;
  }
  get state(): SandboxState {
    try {
      return normalizeState(this.sandbox.status);
    } catch {
      return "starting";
    }
  }
  get errorReason(): string | null {
    return null;
  }

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

  private rawStatus(): string | null {
    try {
      return this.sandbox.status;
    } catch {
      return null;
    }
  }

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
        `[vercel] listSessions failed sandbox=${this.sandbox.name}: ${errorMessage(e)}`,
      );
      return { kind: "error" };
    }
  }

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

  private async waitForStopConfirmation(): Promise<void> {
    const deadline = Date.now() + STOP_CONFIRMATION_TIMEOUT_MS;
    let resolved = await this.resolveSessionStatus();
    let lastKnown =
      resolved.kind === "status" ? resolved.status : resolved.kind;
    let consecutiveIdle = 0;
    let lastStopReissueAt = 0;

    while (Date.now() < deadline) {
      if (
        resolved.kind === "status" &&
        this.isTerminalStopStatus(resolved.status)
      ) {
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
    const maxAttempts = 2;
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
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
      } catch (e) {
        const detail = extractApiErrorDetail(e);
        lastError = providerError(
          `vercel exec failed (cwd=${opts?.cwd ?? "(default)"}, cmd=${cmd.slice(0, 120)})`,
          e,
        );
        if (attempt < maxAttempts && isRetryableExecFailure(detail)) {
          console.log(
            `[vercel] exec transit failure on ${this.id}; refreshing and retrying (attempt ${attempt}/${maxAttempts}): ${detail.slice(0, 200)}`,
          );
          await this.refresh().catch(() => undefined);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error("vercel exec failed");
  }

  async execDetached(cmd: string, opts?: SandboxExecOptions): Promise<void> {
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
    await this.refresh();
    let observed: SandboxState = this.state;
    if (observed === "running") return;

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

    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastError: string | null = null;
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
      if (resolved.kind === "unknown") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.refresh();
        continue;
      }
      try {
        this.sandbox = withoutLazyResume(
          await Sandbox.get({
            ...this.creds,
            onResume: rewireDriveCacheOnResume,
            name: this.sandbox.name,
            resume: true,
          }),
        );
        observed = this.state;
        if (observed === "running") return;
      } catch (e) {
        lastError = errorMessage(e);
        lastErrorStatus = vercelHttpStatus(e);
        lastErrorDetail = extractApiErrorDetail(e);
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
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.refresh();
    }
    throw new SandboxProviderError(
      `vercel start: sandbox ${this.sandbox.name} did not reach running within ${timeoutSeconds}s (state: ${observed}${lastError ? `, last error: ${lastError}` : ""})`,
      { httpStatus: lastErrorStatus, detail: lastErrorDetail ?? "" },
    );
  }
  async extendTimeout(durationMs: number): Promise<void> {
    const expiresAt = this.sandbox.expiresAt?.getTime();
    if (expiresAt !== undefined && expiresAt - Date.now() > durationMs) return;
    try {
      await this.sandbox.extendTimeout(durationMs);
    } catch (e) {
      throw new Error(
        `vercel extendTimeout failed (sandbox=${this.sandbox.name}, durationMs=${durationMs}, sessionTimeout=${this.sandbox.timeout ?? "unknown"}, expiresAt=${expiresAt !== undefined ? new Date(expiresAt).toISOString() : "none"}): ${extractApiErrorDetail(e)}`,
      );
    }
  }

  async stop(): Promise<void> {
    await this.refresh();
    const resolved = await this.resolveSessionStatus();
    if (
      resolved.kind === "empty" ||
      (resolved.kind === "status" && this.isTerminalStopStatus(resolved.status))
    ) {
      return;
    }
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
    const attached = this.rawStatus();
    if (attached !== null) {
      console.log(
        `[vercel] stop requested sandbox=${this.sandbox.name} status=${attached}`,
      );
      await this.ensureSnapshotRetention();
      await this.sandbox.stop();
      await this.waitForStopConfirmation();
      return;
    }
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

  private async ensureSnapshotRetention(): Promise<void> {
    await this.sandbox.update({
      snapshotExpiration: 0,
      keepLastSnapshots: KEEP_LAST_SNAPSHOTS,
    });
  }
  async archive(): Promise<void> {
    await this.stop();
  }

  private async deleteSnapshotsForSandbox(
    sandboxName: string,
    preserveSnapshotIds: ReadonlySet<string>,
  ): Promise<number> {
    const { Snapshot } = await import("@vercel/sandbox");
    const listed = await Snapshot.list({
      ...this.creds,
      name: sandboxName,
    });
    let deleted = 0;
    for await (const meta of listed) {
      if (preserveSnapshotIds.has(meta.id)) continue;
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
            errorMessage(error)
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
          errorMessage(error)
        }`,
      );
    }
    const after = await this.deleteSnapshotsForSandbox(sandboxName, preserve);
    if (before + after > 0) {
      console.log(
        `[vercel] delete sandbox=${sandboxName} purgedSnapshots=${before + after} preserved=${preserve.size}`,
      );
    }
  }
  async refresh(): Promise<void> {
    this.sandbox = withoutLazyResume(
      await Sandbox.get({
        ...this.creds,
        onResume: rewireDriveCacheOnResume,
        name: this.sandbox.name,
        resume: false,
      }),
    );
  }

  async previewUrl(port: number): Promise<PreviewUrl> {
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
    try {
      await this.exec(driveCacheTeardownScript(), { timeoutSeconds: 30 });
    } catch (error) {
      console.warn(
        `[vercel] drive cache teardown before snapshot failed on ${this.id} (continuing): ${errorMessage(error)}`,
      );
    }

    try {
      await this.exec(snapshotPruneScript(), { timeoutSeconds: 120 });
    } catch (error) {
      console.warn(
        `[vercel] snapshot prune failed on ${this.id} (continuing): ${errorMessage(error)}`,
      );
    }

    await this.ensureSnapshotRetention();

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

class VercelSandboxClient implements SandboxClient {
  readonly kind: SandboxProviderKind = "vercel";

  constructor(
    private readonly creds: VercelCredentials,
    private readonly vcpus: number,
  ) {}

  private async resolveMounts(
    mounts: ReadonlyArray<SandboxMount>,
  ): Promise<SandboxMounts | undefined> {
    const resolved: SandboxMounts = {};
    await Promise.all(
      mounts.map(async (mount) => {
        try {
          const drive = await Drive.getOrCreate({
            ...this.creds,
            name: mount.volumeName,
            region: SANDBOX_REGION,
            maxSize: DRIVE_MAX_SIZE_BYTES,
          });
          resolved[mount.path] =
            mount.mode === "read-write" ? drive : drive.snapshot();
        } catch (e) {
          console.warn(
            `[vercel] drive mount skipped name=${mount.volumeName} path=${mount.path} mode=${mount.mode}: ${extractApiErrorDetail(e)}`,
          );
        }
      }),
    );
    return Object.keys(resolved).length > 0 ? resolved : undefined;
  }

  private async snapshotRegions(
    params: SandboxCreateParams,
  ): Promise<SandboxRegion[] | undefined> {
    try {
      const snapshotId = params.forkFrom
        ? (
            await Sandbox.get({
              ...this.creds,
              onResume: rewireDriveCacheOnResume,
              name: params.forkFrom,
              resume: false,
            })
          ).currentSnapshotId
        : params.snapshot;
      if (!snapshotId) return undefined;
      const { Snapshot } = await import("@vercel/sandbox");
      const { regions } = await Snapshot.get({ ...this.creds, snapshotId });
      return regions;
    } catch {
      return undefined;
    }
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    const persistent = params.lifecycle.ephemeral !== true;
    const image = params.image ?? VERCEL_SANDBOX_IMAGE;
    const { region, failoverRegions, mountDrives } = sandboxPlacement(
      await this.snapshotRegions(params),
    );
    const mounts =
      params.mounts?.length && mountDrives
        ? await this.resolveMounts(params.mounts)
        : undefined;
    const vcpus = params.vcpus ?? this.vcpus;
    const base = {
      ...this.creds,
      onResume: rewireDriveCacheOnResume,
      region,
      failoverRegions,
      timeout: Math.max(params.lifecycle.autoStopMinutes, 24 * 60) * 60 * 1000,
      persistent,
      ...vercelSnapshotCreateOptions(persistent),
      resources: { vcpus },
      ports: (params.ports ?? VERCEL_DEFAULT_EXPOSED_PORTS).slice(0, MAX_PORTS),
      ...(params.lifecycle.labels ? { tags: params.lifecycle.labels } : {}),
    };
    const attempt = (withMounts: SandboxMounts | undefined) => {
      const opts = { ...base, ...(withMounts ? { mounts: withMounts } : {}) };
      return params.forkFrom
        ? Sandbox.fork({ ...opts, sourceSandbox: params.forkFrom })
        : params.snapshot
          ? Sandbox.create({
              ...opts,
              source: { type: "snapshot", snapshotId: params.snapshot },
            })
          : Sandbox.create({ ...opts, image });
    };
    const ladder = mountFallbackLadder(mounts);
    try {
      let used = ladder[0];
      const sandbox = await attempt(used).catch(async (e: unknown) => {
        let lastError = e;
        for (const next of ladder.slice(1)) {
          console.warn(
            `[vercel] create failed with mounts=${describeMounts(used)}; retrying with mounts=${describeMounts(next)}: ${extractApiErrorDetail(lastError)}`,
          );
          used = next;
          try {
            return await attempt(next);
          } catch (retryError) {
            lastError = retryError;
          }
        }
        throw lastError;
      });
      console.log(
        `[vercel] created sandbox=${sandbox.name} region=${region} persistent=${persistent} vcpus=${vcpus} forkFrom=${params.forkFrom ?? "none"} sourceSnapshot=${params.snapshot ?? "none"} image=${image} mounts=${describeMounts(used)}`,
      );
      if (!params.snapshot && !params.forkFrom) {
        await sandbox.mkDir("/tmp/repo");
      }
      return new VercelSandboxHandle(sandbox, this.creds);
    } catch (e) {
      const detail = extractApiErrorDetail(e);
      throw new Error(
        `vercel create failed (region=${region}, forkFrom=${params.forkFrom ?? "none"}, snapshot=${params.snapshot ?? "none"}, image=${image}, timeout=${base.timeout}, persistent=${base.persistent}, vcpus=${vcpus}, envKeys=[${Object.keys(params.envVars ?? {}).join(",")}], hasTags=${Boolean(params.lifecycle.labels)}, requestedMounts=${describeMounts(mounts)}): ${detail}`,
      );
    }
  }

  async get(sandboxId: string): Promise<SandboxHandle> {
    const sandbox = await Sandbox.get({
      ...this.creds,
      onResume: rewireDriveCacheOnResume,
      name: sandboxId,
      resume: false,
    });
    const owner = foreignSandboxDeployment(sandbox.tags);
    if (owner !== null) {
      const detail = `sandbox ${sandboxId} belongs to Convex deployment ${owner}`;
      throw new SandboxProviderError(detail, { httpStatus: 404, detail });
    }
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
}

/** Recovers the underlying Vercel sandbox from a handle (PTY, etc.). */
export function unwrapVercelSandbox(handle: SandboxHandle): Sandbox {
  if (handle instanceof VercelSandboxHandle) {
    return handle.unwrap();
  }
  throw new Error("Expected a Vercel-backed sandbox handle.");
}

/** Constructs a Vercel-backed {@link SandboxClient} from access-token credentials. */
export function createVercelClient(
  creds: VercelCredentials,
  vcpus: number,
): SandboxClient {
  return new VercelSandboxClient(creds, vcpus);
}
