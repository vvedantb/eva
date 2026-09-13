import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const launch = readSource("convex/_sandbox_runtime/launch.ts");
const consoleLauncher = readSource(
  "convex/_pty/launchDevServerInVercelConsole.ts",
);
const callbackIndex = readSource("callback-src/index.ts");
const opencodeServer = readSource("callback-src/providers/opencodeServer.ts");
const bundledScript = readSource(
  "convex/_sandbox_runtime/callbackScript.generated.ts",
);
const taskDevServer = readSource("convex/_sandbox_runtime/devServer.ts");

/**
 * Prod dmesg showed the kernel OOM killer firing repeatedly on 16GB session
 * sandboxes; the observed victims decide everything. The callback must die
 * LAST (it is the heartbeat and failure reporter — when it dies, turns hang
 * silently), agent CLI subtrees and dev servers must die FIRST (a killed CLI
 * becomes a reported turn error; a killed dev server self-heals via
 * ensureSessionPreviewServices). These rules pin the kill-order plumbing.
 */
describe("the OOM kill order protects the reporter", () => {
  test("the launcher lowers the callback score with privilege, fail-open", () => {
    const pidWriteAt = launch.indexOf('"echo $! > /tmp/run-design.pid"');
    const lowerAt = launch.indexOf("sudo -n tee");
    expect(pidWriteAt, "the pid write moved").toBeGreaterThan(-1);
    expect(lowerAt, "the privileged lowering moved").toBeGreaterThan(-1);
    // The adjust needs the pid, so it must follow the pid write.
    expect(pidWriteAt).toBeLessThan(lowerAt);

    const lowering = launch.slice(lowerAt - 200, lowerAt + 200);
    expect(lowering).toContain("oom_score_adj");
    expect(lowering, "sudo may be missing on some images").toContain("|| true");
    const value = launch.match(/echo (-\d+) \| sudo -n tee/);
    expect(value, "the launcher score moved").not.toBeNull();
    // Strongly protected but never unkillable (-1000 would risk livelock).
    expect(Number(value?.[1])).toBeLessThanOrEqual(-300);
    expect(Number(value?.[1])).toBeGreaterThan(-1000);
  });

  test("the callback keeps its unprivileged best-effort lowering", () => {
    // Belt for environments where the launcher's sudo is unavailable but the
    // process happens to have the capability.
    expect(callbackIndex).toContain('writeOomScoreAdj("self", "-600")');
    expect(readSource("callback-src/runtime/daemonProcess.ts")).toContain(
      '"/proc/self/oom_score_adj"',
    );
  });

  test("the opencode server subtree is re-raised to killable", () => {
    // The only agent process the callback still spawns now that the CLI runner
    // is deleted, and every opencode tool process descends from it. Children
    // inherit the callback's protected score; raising our own child is always
    // permitted, and tool processes (tsc, builds) inherit the raised score.
    const raise = opencodeServer.match(/writeOomScoreAdj\(pid, "(\d+)"\)/);
    expect(raise, "the opencode server re-raise moved").not.toBeNull();
    expect(Number(raise?.[1])).toBeGreaterThanOrEqual(200);
  });

  test("the deployed bundle carries both callback-side pieces", () => {
    expect(bundledScript).toContain('"/proc/self/oom_score_adj"');
    expect(bundledScript).toContain('"/oom_score_adj", "300"');
  });
});

/**
 * The other half of the memory story: one leaky Next dev compile reached
 * ~5.5GB RSS and pushed the whole VM into OOM. A capped heap turns that into
 * a clean, self-healing dev-server crash instead of collateral kernel kills.
 */
describe("eva-launched dev servers run with a capped heap", () => {
  test("the Console launch script caps V8 before the dev command", () => {
    const body = functionBody(
      consoleLauncher,
      "export async function launchDevServerInVercelConsole(",
    );
    const capAt = body.indexOf("--max-old-space-size=");
    const commandAt = body.indexOf("devCommand,");
    expect(capAt, "the heap cap moved").toBeGreaterThan(-1);
    expect(commandAt, "the dev command slot moved").toBeGreaterThan(-1);
    expect(capAt).toBeLessThan(commandAt);

    const cap = body.match(/--max-old-space-size=(\d+)/);
    const mb = Number(cap?.[1] ?? "0");
    // Big enough for a heavy Next dev compile, small enough that one server
    // cannot take down a 16GB VM.
    expect(mb).toBeGreaterThanOrEqual(4096);
    expect(mb).toBeLessThanOrEqual(8192);
    // An env- or repo-provided NODE_OPTIONS must still win (ours goes first).
    expect(body).toContain("${NODE_OPTIONS:+ $NODE_OPTIONS}");
  });

  test("the task-run background launcher caps V8 before the dev command", () => {
    // Quick tasks and project chats launch their dev server through
    // launchDevServerInBackground, not the Console launcher, but the same
    // 16GB-VM OOM risk applies.
    const body = functionBody(
      taskDevServer,
      "export async function launchDevServerInBackground(",
    );
    const capAt = body.indexOf("--max-old-space-size=");
    const commandAt = body.indexOf("devCommand,");
    expect(capAt, "the heap cap moved").toBeGreaterThan(-1);
    expect(commandAt, "the dev command slot moved").toBeGreaterThan(-1);
    expect(capAt).toBeLessThan(commandAt);

    const cap = body.match(/--max-old-space-size=(\d+)/);
    const mb = Number(cap?.[1] ?? "0");
    expect(mb).toBeGreaterThanOrEqual(4096);
    expect(mb).toBeLessThanOrEqual(8192);
    expect(body).toContain("${NODE_OPTIONS:+ $NODE_OPTIONS}");
  });
});

/** Comments name the very calls these rules rule out, so they have to go first. */
function readSource(relativePath: string): string {
  return stripComments(
    readFileSync(join(backendDir, relativePath), "utf8").replaceAll(
      "\r\n",
      "\n",
    ),
  );
}

/** One top-level function, ending on the `\n}` that closes it at column 0. */
function functionBody(source: string, header: string): string {
  const startAt = source.indexOf(header);
  expect(startAt, `${header} moved or was renamed`).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", startAt);
  return source.slice(startAt, end < 0 ? undefined : end);
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}
