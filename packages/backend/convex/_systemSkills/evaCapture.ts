import type { SystemSkillHydration } from "./registry";

/**
 * Content served by the `get_skill` MCP tool for `eva-capture`. Mirrors the
 * session browser rules (`_sessions/prompts.ts`) so an invoked capture lands
 * its files where the runtime already looks for them.
 */
export function buildEvaCaptureContent(
  hydration: SystemSkillHydration,
): string {
  const devPort = hydration.devPort ?? 3000;
  const devCommand = hydration.devCommand?.trim() || "pnpm run dev";
  const appUrl = `http://localhost:${devPort}`;
  const rootDirectoryLine = hydration.rootDirectory
    ? `\n- App directory: \`/tmp/repo/${hydration.rootDirectory}\` — run app commands there, but always write captures to the repo-root folders below.`
    : "";
  const startupLine =
    hydration.startupCommands && hydration.startupCommands.length > 0
      ? `\n- Background services Eva starts for this repo: ${hydration.startupCommands.map((command) => `\`${command}\``).join(", ")}. They must be healthy before you capture.`
      : "";

  return `# eva-capture

Capture visual proof of what changed and leave the files on disk. Eva uploads whatever is left in the deliverable folders when the turn ends and posts it into the chat.

## This repo
- Repo: ${hydration.owner}/${hydration.name}
- App URL: ${appUrl}
- Dev command (only if nothing is listening): \`${devCommand}\`${rootDirectoryLine}${startupLine}

## Step 1 — Decide what to capture
1. \`cd /tmp/repo && git log --oneline -5\`
2. \`git show --stat HEAD\`, then \`git show HEAD\` for the hunks.
3. Write a short plan before capturing: which files changed, which user-visible UI each one affects, which route(s) on ${appUrl} to open, and what must be in frame for a reviewer to confirm the change.
4. Do not capture a random page. The capture must match the diff or the user's explicit request.

## Step 2 — Get the app up
Eva auto-starts the dev server on port ${devPort} after every sandbox start. A cold compile takes 1-2 minutes, so retry \`curl -sf ${appUrl}\` for up to about two minutes before concluding it is down. NEVER start a second dev server — duplicates have caused out-of-memory crashes on this VM. Only if the port serves nothing after two minutes, start \`${devCommand}\` in the background and wait for ready.

Check the page for backend errors before capturing. If you see Convex errors ("Could not find public function", "Server Error", missing query or mutation, connection refused), check \`/tmp/bg-*.log\` and \`pgrep -af convex\`, restart the repo background command, wait for the deploy, then reload.

## Step 3 — Use the shared browser
So the user can watch live:
1. Call the eva MCP \`browser_start\` tool (shared desktop Chrome with CDP on 9222).
2. Run \`agent-browser connect 9222\` once. All later agent-browser commands drive that Chrome.
3. Call \`browser_lock\` before interacting and \`browser_unlock\` when done.
4. Skip \`set viewport\` in this mode — Chrome is already 1920x1080.

If \`browser_start\` is unavailable, fall back to headless agent-browser and run \`agent-browser set viewport 1920 1080\`.

## Step 4 — Capture
- Deliverables go to \`/tmp/repo/recordings/\` (video) and \`/tmp/repo/screenshots/\` (stills). Chat captions each capture with its file name, so name it for what it shows (e.g. \`empty-box-page.png\`, not \`shot1.png\`). Always use absolute paths — relative paths resolve against the agent-browser daemon's cwd, not your shell's.
- Clear leftovers first, but keep the \`.posted/\` archive (captures already posted to chat, kept for reuse): \`mkdir -p /tmp/repo/recordings /tmp/repo/screenshots && find /tmp/repo/recordings /tmp/repo/screenshots -maxdepth 1 -type f -delete\`. Never \`rm -rf\` these folders.
- Open the route from your plan and wait at least 5 seconds after each navigation for the page to render.
- Default to video: \`agent-browser record start /tmp/repo/recordings/<name>.webm\`, walk through the changed UI, then \`agent-browser record stop\`. A few seconds after \`record start\`, run \`ls -la /tmp/repo/recordings/\` and confirm the .webm exists and is growing — ffmpeg writes it progressively, so a missing or 0-byte file means recording is broken (usually no ffmpeg). Do not retry-loop; fall back to screenshots.
- A screenshot is enough for a small copy or style change: \`agent-browser screenshot /tmp/repo/screenshots/<name>.png\`. Even a one-character text change must be captured on the live page.
- Working captures — page-state checks, login verification, "did it render" shots — go to \`/tmp/checks/\`, never the deliverable folders. When the turn ends those two folders must hold exactly what the user asked for and nothing else.
- For "each" or "all features" requests, write a checklist first and produce one isolated deliverable per item.

## Step 5 — Verify, then report
Re-read your plan and confirm the capture shows the same UI the diff changed. Re-capture once if you see a runtime error, a blank page, an error boundary, a loading spinner, or the old state.

Then reply naming which file demonstrates what. "Recording now" is not a final answer — finish the captures first. If capture is impossible, report the concrete failure rather than promising future work.

## Rules
- Do not edit source files, commit, or push. This skill is read-only.
- Do not use \`create_artifact\` or paste a URL for these captures. Eva attaches the files itself. (To embed a capture in a PR comment or Linear issue, use eva MCP \`upload_media\`, curl the file to the returned uploadUrl, then \`get_media_url\` for a public link.)
- Do not commit the recordings or screenshots folders.
- Leave the app and background services running.
- Never use \`pkill -f\`, \`pgrep -f\`, or \`killall\` to clean up ffmpeg, Chrome, or recording processes — the recording instructions are in this turn's command line, so a broad match can kill the turn. Stop recordings with \`agent-browser record stop\`; otherwise capture an exact PID at launch and stop only that PID.
- Never use \`sleep\` or \`2>/dev/null\` without \`|| echo "fallback"\`.
`;
}
