"use node";

import type { SandboxHandle } from "../_sandbox/provider";
import { execHandle } from "./helpers";
import { buildHttpReadyProbeCommand } from "./httpReadyProbe";

/**
 * Chrome launch flags for the sandbox (Vercel's Xvnc framebuffer, display :1).
 * - --disable-dev-shm-usage: /dev/shm is tiny in these VMs.
 * - --user-data-dir: required for --remote-debugging-port to bind.
 * - --disable-gpu --in-process-gpu: Vercel/Amazon Linux has no GPU + no WM;
 *   match vercel-sandbox-gui so Chrome paints into the Xvnc framebuffer.
 * - background/throttle flags keep Convex/Supabase websockets alive in
 *   background tabs.
 */
const CHROME_FLAGS = [
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--start-maximized",
  "--window-size=1920,1080",
  "--disable-gpu",
  "--in-process-gpu",
  "--user-data-dir=/home/eva/.config/chrome-debug",
  "--remote-debugging-port=9222",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,TabFreezing,AutomaticTabDiscarding",
  "--memory-pressure-off",
].join(" ");

/**
 * Chrome purges all session cookies (no-expiry auth cookies — Clerk, Supabase,
 * most app logins) on startup unless the profile has "continue where you left
 * off" (restore_on_startup=1). Every sandbox resume relaunches Chrome, so
 * without this every resume signs the user out of the app under development.
 * exit_type/exited_cleanly must also be reset: pkill looks like a crash, and a
 * crashed exit skips session restore. Runs before each launch; double quotes
 * only so the whole script survives single-quote sh wrapping.
 */
export const CHROME_PREFS_SCRIPT = [
  'const fs=require("fs");',
  'const dir="/home/eva/.config/chrome-debug/Default";',
  'const p=dir+"/Preferences";',
  "let d={};",
  'try{d=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}',
  "d.session=Object.assign({},d.session,{restore_on_startup:1});",
  'd.profile=Object.assign({},d.profile,{exit_type:"Normal",exited_cleanly:true});',
  "fs.mkdirSync(dir,{recursive:true});",
  "fs.writeFileSync(p,JSON.stringify(d));",
].join("");

/**
 * Launches Chrome in the sandbox with remote debugging enabled.
 *
 * On Vercel, long-running Chrome MUST use native execDetached — `nohup … &`
 * inside a synchronous runCommand leaves Chrome as a zombie once that command
 * exits (same failure mode as Xvnc/websockify).
 */
export async function launchChrome(sandbox: SandboxHandle): Promise<void> {
  try {
    // Already running with our debug port — keep existing tabs.
    const already = await sandbox.exec(
      "curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1",
      { timeoutSeconds: 5 },
    );
    if (already.exitCode === 0) {
      return;
    }

    await sandbox.exec(
      [
        "BROWSER=$(command -v google-chrome-stable || command -v chromium-browser || command -v chromium || true)",
        'if [ -z "$BROWSER" ]; then echo "no chrome binary" >&2; exit 0; fi',
        "pkill -x chrome 2>/dev/null || true",
        "pkill -x chromium 2>/dev/null || true",
        "pkill -x chromium-browser 2>/dev/null || true",
        "pkill -x google-chrome 2>/dev/null || true",
        "pkill -x google-chrome-stable 2>/dev/null || true",
        "sleep 1",
        "mkdir -p /home/eva/.config/chrome-debug",
        "rm -rf /home/eva/.config/chrome-debug/Singleton* 2>/dev/null || true",
        `node -e '${CHROME_PREFS_SCRIPT}' 2>/dev/null || true`,
        // Resolve display: Vercel Xvnc is :1; :0 is a legacy fallback.
        'DISPLAY_VALUE="${EVA_DESKTOP_DISPLAY:-}"',
        'if [ -z "$DISPLAY_VALUE" ]; then DISPLAY=:1 xprop -root >/dev/null 2>&1 && DISPLAY_VALUE=:1; fi',
        'if [ -z "$DISPLAY_VALUE" ]; then DISPLAY=:0 xprop -root >/dev/null 2>&1 && DISPLAY_VALUE=:0; fi',
        'if [ -z "$DISPLAY_VALUE" ]; then DISPLAY_VALUE=:0; fi',
        'echo "$DISPLAY_VALUE" > /tmp/eva-chrome-display',
        'echo "$BROWSER" > /tmp/eva-chrome-bin',
      ].join("\n"),
      { timeoutSeconds: 30 },
    );

    // Detach Chrome so it survives the launcher command exiting.
    await sandbox.execDetached(
      [
        "BROWSER=$(cat /tmp/eva-chrome-bin 2>/dev/null || true)",
        "DISPLAY_VALUE=$(cat /tmp/eva-chrome-display 2>/dev/null || echo :0)",
        'if [ -z "$BROWSER" ] || [ ! -x "$BROWSER" ]; then exit 0; fi',
        `DISPLAY="$DISPLAY_VALUE" exec "$BROWSER" ${CHROME_FLAGS} "about:blank" >/tmp/chrome.log 2>&1`,
      ].join("; "),
    );

    // Wait briefly for DevTools to come up (best-effort).
    await sandbox.exec(
      buildHttpReadyProbeCommand({
        url: "http://127.0.0.1:9222/json/version",
        attempts: 20,
        sleepSec: 0.5,
        onReady: "exit 0",
        onTimeout: "exit 0",
      }),
      { timeoutSeconds: 20 },
    );
  } catch {
    // Non-fatal: Chrome launch failure shouldn't break the desktop
  }
}

/** Starts the sandbox desktop environment and launches Chrome. */
export async function startDesktopWithChrome(
  sandbox: SandboxHandle,
): Promise<void> {
  if (!sandbox.desktop) {
    return;
  }
  try {
    await sandbox.desktop.start();
    try {
      await execHandle(
        sandbox,
        "for i in 1 2 3 4 5 6 7 8 9 10; do DISPLAY=:1 xdpyinfo > /dev/null 2>&1 && break; DISPLAY=:0 xdpyinfo > /dev/null 2>&1 && break; sleep 1; done",
        15,
      );
    } catch {
      // Non-fatal: continue and hope display is ready
    }
    await launchChrome(sandbox);
  } catch {
    // Non-fatal: entire desktop startup failure shouldn't block the workflow
  }
}
