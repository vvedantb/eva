/**
 * Git and desktop capabilities built only on a handle's `exec` / `execDetached`,
 * shared by every provider. The only per-provider input is how the desktop
 * stack gets installed (dnf on Vercel's Amazon Linux, apt on Boat's Ubuntu).
 */

import type { SandboxDesktop, SandboxGit, SandboxHandle } from "./provider";
import { FFMPEG_INSTALL_SCRIPT } from "./ffmpegInstall";

type ShellHandle = Pick<SandboxHandle, "exec" | "execDetached">;

/** Git operations over the shell (no provider has a native git client). */
export class ShellGit implements SandboxGit {
  constructor(private readonly handle: Pick<SandboxHandle, "exec">) {}

  private async sh(cmd: string): Promise<string> {
    // Goes through handle.exec so the provider's own retry rules apply.
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

/** Shell lines that install the VNC stack and Chrome when they are missing. */
export interface DesktopInstallScript {
  /** Runs when Xvnc, websockify or noVNC is missing. May assume `$NOVNC_DIR` is set if noVNC exists. */
  stack: ReadonlyArray<string>;
  /** Runs when no Chrome/Chromium binary is on PATH. */
  chrome: ReadonlyArray<string>;
}

/** Shared tail of both stack installs: websockify from pip, noVNC from git. */
const WEBSOCKIFY_AND_NOVNC = [
  "  sudo python3 -m pip install --break-system-packages websockify >/tmp/websockify-pip.log 2>&1 || python3 -m pip install --user websockify >/tmp/websockify-pip.log 2>&1",
  "  command -v websockify >/dev/null 2>&1 || sudo ln -sf $(python3 -m site --user-base)/bin/websockify /usr/local/bin/websockify || true",
  '  if [ -z "$NOVNC_DIR" ]; then sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc >/tmp/novnc-git.log 2>&1; NOVNC_DIR=/opt/novnc; fi',
];

/** Amazon Linux 2023 (Vercel): dnf, Chrome from Google's yum repo. */
export const DNF_DESKTOP_INSTALL: DesktopInstallScript = {
  stack: [
    "  sudo dnf install -y tigervnc-server python3 python3-pip xorg-x11-utils xterm dbus-x11 procps-ng psmisc git >/tmp/desktop-dnf.log 2>&1",
    "  sudo dnf install -y gtk3 nss alsa-lib libXScrnSaver libXtst at-spi2-core libdrm mesa-libgbm libxkbcommon libXdamage libXcomposite libXrandr libXcursor libXinerama cups-libs >/tmp/desktop-gui-dnf.log 2>&1 || true",
    ...WEBSOCKIFY_AND_NOVNC,
  ],
  chrome: [
    "  sudo tee /etc/yum.repos.d/google-chrome.repo >/dev/null <<'EOF'",
    "[google-chrome]",
    "name=google-chrome",
    "baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64",
    "enabled=1",
    "gpgcheck=1",
    "gpgkey=https://dl.google.com/linux/linux_signing_key.pub",
    "EOF",
    "  sudo dnf install -y google-chrome-stable >/tmp/chrome-dnf.log 2>&1 || sudo dnf install -y chromium >/tmp/chromium-dnf.log 2>&1 || true",
  ],
};

/** `apt-get install`, refreshing the package index once if the cached one is stale. */
export function aptInstall(packages: string, log: string): string {
  const install = `sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${packages} >>${log} 2>&1`;
  return `${install} || { sudo apt-get update >>${log} 2>&1 && ${install}; }`;
}

/** Ubuntu 24.04 (Boat): apt. Boat images ship Chrome, so the fallback rarely runs. */
export const APT_DESKTOP_INSTALL: DesktopInstallScript = {
  stack: [
    `  ${aptInstall("tigervnc-standalone-server x11-utils x11-xserver-utils xterm dbus-x11 procps psmisc python3-pip git", "/tmp/desktop-apt.log")}`,
    ...WEBSOCKIFY_AND_NOVNC,
  ],
  chrome: [
    "  curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb >/tmp/chrome-apt.log 2>&1 && " +
      aptInstall("/tmp/chrome.deb", "/tmp/chrome-apt.log") +
      " || true",
  ],
};

/**
 * TigerVNC (Xvnc :1) + websockify + noVNC, aligned with timolins/vercel-sandbox-gui.
 * No window manager: Chrome runs directly on the Xvnc display (Amazon Linux has
 * no usable WM packages, and one layout for every provider keeps them in step).
 *
 * Critical: long-running Xvnc/websockify MUST use native detached exec
 * (execDetached). Backgrounding with `setsid … &` OR plain `&` inside a
 * synchronous command leaves zombies (ppid=1, state Z) once that command
 * exits — HTTP may briefly answer then the RFB WebSocket hangs on noVNC
 * "Loading". Detached commands survive the launcher exiting.
 */
export class ShellDesktop implements SandboxDesktop {
  constructor(
    private readonly handle: ShellHandle,
    private readonly install: DesktopInstallScript,
  ) {}

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
        ...this.install.stack,
        "fi",
        "if ! command -v google-chrome-stable >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then",
        ...this.install.chrome,
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
