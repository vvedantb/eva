import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildEnsureSwapScript,
  buildReleaseSwapScript,
  DEFAULT_SWAP_MIN_MIB,
  DEFAULT_SWAP_RESERVE_MIB,
  DEFAULT_SWAP_SIZE_MIB,
  resolveSwapConfig,
  swapProvisioningDisabled,
} from "../convex/_sandbox_runtime/swap";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const helpers = readSource("convex/_sandbox_runtime/helpers.ts");
const execution = readSource("convex/_sandbox_runtime/execution.ts");
const sessions = readSource("convex/_sandbox_runtime/sessions.ts");
const lifecycle = readSource("convex/_sandbox_runtime/lifecycle.ts");
const snapshotActions = readSource("convex/snapshotActions.ts");
const git = readSource("convex/_sandbox_runtime/git.ts");
const devServer = readSource("convex/_sandbox_runtime/devServer.ts");
const consoleLauncher = readSource(
  "convex/_pty/launchDevServerInVercelConsole.ts",
);

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Prod dmesg (2026-08-07) showed the kernel OOM-killing convex-local-backend at
 * ~11.5GB RSS on a 16GB, zero-swap sandbox during snapshot-restore startup. The
 * VM cannot get more RAM (Vercel Pro caps a sandbox at 8 vCPU / 16GB and eva
 * already asks for 8) nor more disk (32GB on every plan), so swap absorbs the
 * spike. Disk is the binding constraint: a 12GB swapfile once filled the disk
 * to 100% and broke writes.
 */
describe("swap is sized to survive a tight disk", () => {
  test("the script never eats into the free-disk reserve", () => {
    const script = buildEnsureSwapScript({
      sizeMib: 6144,
      reserveMib: 5120,
      minMib: 2048,
    });
    expect(script).toContain("SIZE=$((AVAIL - RESERVE))");
    expect(script).toContain("RESERVE=5120");
    // Requested size is a ceiling, free-disk-minus-reserve is the cap.
    expect(script).toContain('if [ "$SIZE" -gt "$WANT" ]; then SIZE=$WANT; fi');
  });

  test("the defaults leave more than 5GB free and stay in the 6-8GB range", () => {
    // The task's acceptance criterion is "free disk stays > 5 GB".
    expect(DEFAULT_SWAP_RESERVE_MIB).toBeGreaterThanOrEqual(5120);
    expect(DEFAULT_SWAP_SIZE_MIB).toBeGreaterThanOrEqual(6144);
    expect(DEFAULT_SWAP_SIZE_MIB).toBeLessThanOrEqual(8192);
    expect(DEFAULT_SWAP_MIN_MIB).toBeLessThan(DEFAULT_SWAP_SIZE_MIB);
  });

  test("too little disk skips swap instead of filling the disk", () => {
    const script = buildEnsureSwapScript({
      sizeMib: 6144,
      reserveMib: 5120,
      minMib: 2048,
    });
    const skipAt = script.indexOf("eva-swap:skipped reason=low-disk");
    const allocateAt = script.indexOf("fallocate");
    expect(skipAt, "the low-disk skip moved").toBeGreaterThan(-1);
    expect(skipAt, "the skip must precede any allocation").toBeLessThan(
      allocateAt,
    );
  });

  test("size, reserve and min are env-tunable, with a kill switch", () => {
    vi.stubEnv("SANDBOX_SWAP_SIZE_MIB", "4096");
    vi.stubEnv("SANDBOX_SWAP_RESERVE_MIB", "6144");
    vi.stubEnv("SANDBOX_SWAP_MIN_MIB", "1024");
    expect(resolveSwapConfig()).toEqual({
      sizeMib: 4096,
      reserveMib: 6144,
      minMib: 1024,
    });
    expect(swapProvisioningDisabled()).toBe(false);
    vi.stubEnv("SANDBOX_SWAP_DISABLED", "1");
    expect(swapProvisioningDisabled()).toBe(true);
  });

  test("junk env values fall back to the defaults", () => {
    vi.stubEnv("SANDBOX_SWAP_SIZE_MIB", "lots");
    vi.stubEnv("SANDBOX_SWAP_RESERVE_MIB", "-1");
    expect(resolveSwapConfig().sizeMib).toBe(DEFAULT_SWAP_SIZE_MIB);
    expect(resolveSwapConfig().reserveMib).toBe(DEFAULT_SWAP_RESERVE_MIB);
  });
});

describe("the provisioning script is idempotent and fail-open", () => {
  const script = buildEnsureSwapScript({
    sizeMib: 6144,
    reserveMib: 5120,
    minMib: 2048,
  });

  test("active swap short-circuits before any allocation", () => {
    // It runs on every boot and again before the daemons, so the no-op path has
    // to be the first thing it does.
    const guardAt = script.indexOf("swapon --show=NAME --noheadings");
    const allocateAt = script.indexOf("fallocate");
    expect(guardAt, "the already-active guard moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(allocateAt);
    expect(script.slice(guardAt, allocateAt)).toContain("exit 0");
  });

  test("a snapshot-restored swapfile is reused, and an oversized one resized", () => {
    expect(script).toContain("eva-swap:reused");
    expect(script).toContain('[ "$existing" -gt "$WANT" ]');
    expect(script).toContain("eva-swap:resizing");
  });

  test("dd covers filesystems that reject fallocate", () => {
    const fallocateAt = script.indexOf("fallocate -l");
    const ddAt = script.indexOf("dd if=/dev/zero");
    expect(fallocateAt, "the fast path moved").toBeGreaterThan(-1);
    expect(ddAt, "the fallback moved").toBeGreaterThan(fallocateAt);
    // Reports the filesystem type when both fail, so an overlay root is visible.
    expect(script).toContain("stat -f -c %T /");
  });

  test("mkswap and swapon run in order on a locked-down file", () => {
    const chmodAt = script.indexOf('chmod 600 "$SWAP" || true');
    const mkswapAt = script.indexOf('mkswap "$SWAP" >/dev/null 2>&1; then');
    const swaponAt = script.indexOf('swapon "$SWAP" >/dev/null 2>&1; then');
    expect(chmodAt).toBeGreaterThan(-1);
    expect(chmodAt).toBeLessThan(mkswapAt);
    expect(mkswapAt).toBeLessThan(swaponAt);
  });

  test("no failure path can break a boot", () => {
    // Swap is an optimisation; a sandbox without it must still start.
    expect(script).not.toContain("exit 1");
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
    // Half-made swapfiles are removed so they cannot occupy disk for nothing.
    expect(script).toContain("eva-swap:failed stage=mkswap");
    expect(script).toContain("eva-swap:failed stage=swapon");
  });
});

describe("swap exists before anything can spike memory", () => {
  test("ensureSandboxRunning provisions swap on both boot paths", () => {
    const body = functionBody(
      helpers,
      "export async function ensureSandboxRunning(",
    );
    const swapCalls = body.match(/await ensureSwapFile\(sandbox\)/g) ?? [];
    // One for the already-running branch, one after start().
    expect(swapCalls.length).toBe(2);
    // Docker bootstrap is slow; swap must not wait behind it.
    expect(body.indexOf("ensureSwapFile")).toBeLessThan(
      body.indexOf("ensureDockerDaemon"),
    );
  });

  test("the early-ready resume path pays for swap after unlocking the UI", () => {
    // resumeReusedSandbox passes skipDocker to unlock chat sooner, so it owns
    // the per-boot bootstrap itself.
    const swapAt = sessions.indexOf("await ensureSwapFile(handle)");
    const dockerAt = sessions.indexOf("await ensureDockerDaemon(handle)");
    expect(swapAt, "the resume-path swap call moved").toBeGreaterThan(-1);
    expect(swapAt).toBeLessThan(dockerAt);
  });

  test("runBackgroundCommands provisions swap before launching daemons", () => {
    // The last gate before `convex dev` (snapshot restore + schema validate)
    // and `next dev` cold compile — the exact stack that OOMed.
    const body = functionBody(
      execution,
      "export const runBackgroundCommands = internalAction({",
    );
    const swapAt = body.indexOf("await ensureSwapFile(sandbox)");
    const loopAt = body.indexOf("for (let i = 0; i < commands.length; i++)");
    expect(swapAt, "the pre-daemon swap call moved").toBeGreaterThan(-1);
    expect(loopAt, "the launch loop moved").toBeGreaterThan(-1);
    expect(swapAt).toBeLessThan(loopAt);
  });

  test("a freshly created sandbox has swap before install and build", () => {
    // createSandbox is the one door every sandbox comes through — session,
    // quick task, project chat and seed prep — and its caller installs
    // dependencies and builds long before any resume path would run.
    const body = functionBody(git, "export async function createSandbox(");
    const swapAt = body.indexOf("ensureSwapFile(sandbox)");
    const dockerAt = body.indexOf("bootstrapVercelDocker(sandbox)");
    expect(swapAt, "the post-create swap step moved").toBeGreaterThan(-1);
    expect(dockerAt, "the docker bootstrap moved").toBeGreaterThan(-1);
    expect(swapAt).toBeLessThan(dockerAt);
  });

  test("both dev server launchers provision swap before a cold compile", () => {
    // Preview self-heal and the task dev-server re-run reach a running sandbox
    // with no boot step — and a lazily resumed VM comes up swapless, because
    // stop released the file.
    const consoleBody = functionBody(
      consoleLauncher,
      "export async function launchDevServerInVercelConsole(",
    );
    const consoleSwapAt = consoleBody.indexOf("await ensureSwapFile(handle)");
    expect(
      consoleSwapAt,
      "the Console launcher swap call moved",
    ).toBeGreaterThan(-1);
    expect(consoleSwapAt).toBeLessThan(consoleBody.indexOf("tmux send-keys"));

    const backgroundBody = functionBody(
      devServer,
      "export async function launchDevServerInBackground(",
    );
    const backgroundSwapAt = backgroundBody.indexOf(
      "await ensureSwapFile(sandbox)",
    );
    expect(
      backgroundSwapAt,
      "the detached launcher swap call moved",
    ).toBeGreaterThan(-1);
    expect(backgroundSwapAt).toBeLessThan(
      backgroundBody.indexOf("execDetached"),
    );
  });

  test("the seed run provisions swap before install, build and daemons", () => {
    const swapAt = snapshotActions.indexOf("SEEDRUN-STAGE:swap");
    const installAt = snapshotActions.indexOf("SEEDRUN-STAGE:install");
    const daemonsAt = snapshotActions.indexOf("SEEDRUN-STAGE:daemons");
    expect(swapAt, "the seed swap stage moved").toBeGreaterThan(-1);
    expect(swapAt).toBeLessThan(installAt);
    expect(swapAt).toBeLessThan(daemonsAt);
    // Same builder as the per-boot path — no second copy of the shell logic.
    expect(snapshotActions).toContain(
      "buildEnsureSwapScript(resolveSwapConfig())",
    );
  });
});

describe("the swapfile never enters a snapshot", () => {
  const release = buildReleaseSwapScript();

  test("every capture path releases swap first", () => {
    // A baked-in swapfile would spend GBs of the restored VM's 32GB disk on a
    // file the next boot recreates in seconds.
    const stopBody = functionBody(
      lifecycle,
      "export const stopSandbox = internalAction({",
    );
    expect(stopBody.indexOf("releaseSwapFile")).toBeLessThan(
      stopBody.indexOf("sandbox.stop()"),
    );

    const seedBody = functionBody(
      snapshotActions,
      "export const triggerSeededSnapshot = internalAction({",
    );
    expect(seedBody.indexOf("releaseSwapFile")).toBeLessThan(
      seedBody.indexOf("createSnapshot"),
    );
  });

  test("release refuses to swapoff when that would itself risk an OOM", () => {
    // swapoff pages everything back into RAM.
    expect(release).toContain("MemAvailable");
    const guardAt = release.indexOf('[ "$USED" -gt "$((AVAIL - 1024))" ]');
    const swapoffAt = release.indexOf('swapoff "$SWAP"');
    expect(guardAt, "the headroom guard moved").toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(swapoffAt);
    expect(release).toContain("eva-swap:release-skipped");
  });

  test("release is fail-open and clears an inactive leftover file", () => {
    expect(release).not.toContain("exit 1");
    expect(release).toContain("eva-swap:release-noop");
    expect(release).toContain('rm -f "$SWAP"');
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
