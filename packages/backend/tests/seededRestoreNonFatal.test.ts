import { describe, expect, test } from "vitest";
import type {
  SandboxExecResult,
  SandboxHandle,
} from "../convex/_sandbox/provider";
import { startSessionServices } from "../convex/_sandbox_runtime/devServer";

/**
 * carepulse-ts session 87: the repo's `supabase` CLI never installed, so
 * `pnpm start-db` inside the seeded dump restore exited 127. The restore threw
 * out of `startSessionServices` before the dev command resolved, and the
 * Preview Console never got a dev server on start or resume (fix 395da8937).
 *
 * `sandboxReuseFallbackContract.test.ts` pins the try/catch by source text.
 * This runs the real path against a fake VM, so a refactor that keeps the
 * text but lets the error escape (or drops it before the chat alert) fails.
 */

const DUMP_PROBE = "test -f /home/eva/.eva-snapshot-state/";
const MARKER_PROBE = "test -f /tmp/.eva-supabase-db-web-restored";
const DOCKER_PROBE = "docker info >/dev/null 2>&1";
const RESTORE_SCRIPT = "set -e\nset -o pipefail\ncd /tmp/repo";

const OVERRIDES = { devPort: 3000, devCommand: "pnpm dev" };

function fakeHandle(options: {
  hasDump: boolean;
  restore: SandboxExecResult;
}): { handle: SandboxHandle; commands: string[] } {
  const commands: string[] = [];
  // Anything the restore path does not deliberately reach is a fault: a new
  // exec on this path should be added here on purpose, not silently pass.
  const outOfScope = (member: string): never => {
    throw new Error(`fake sandbox: ${member} is out of scope for this test`);
  };
  const exec = async (cmd: string): Promise<SandboxExecResult> => {
    commands.push(cmd);
    if (cmd.startsWith(DUMP_PROBE)) {
      return { exitCode: options.hasDump ? 0 : 1, output: "" };
    }
    if (cmd === MARKER_PROBE) return { exitCode: 1, output: "" };
    if (cmd === DOCKER_PROBE) return { exitCode: 0, output: "" };
    if (cmd.startsWith(RESTORE_SCRIPT)) return options.restore;
    return outOfScope(`exec(${JSON.stringify(cmd.slice(0, 60))})`);
  };
  const handle: SandboxHandle = {
    id: "sbx-seeded-restore",
    state: "running",
    errorReason: null,
    classifyForReconcile: () => Promise.resolve("alive"),
    exec,
    refresh: () => outOfScope("refresh"),
    stop: () => outOfScope("stop"),
    start: () => outOfScope("start"),
    writeFile: () => outOfScope("writeFile"),
    execDetached: () => outOfScope("execDetached"),
    archive: () => outOfScope("archive"),
    extendTimeout: () => outOfScope("extendTimeout"),
    delete: () => outOfScope("delete"),
    previewUrl: () => outOfScope("previewUrl"),
    createSnapshot: () => outOfScope("createSnapshot"),
    git: {
      branches: () => outOfScope("git.branches"),
      clone: () => outOfScope("git.clone"),
      checkoutBranch: () => outOfScope("git.checkoutBranch"),
    },
  };
  return { handle, commands };
}

describe("a failed seeded Supabase restore never blocks the dev server", () => {
  test("exit 127 in the restore still resolves the dev command and reports the error", async () => {
    const { handle, commands } = fakeHandle({
      hasDump: true,
      restore: { exitCode: 127, output: "sh: supabase: command not found" },
    });

    const services = await startSessionServices(handle, "", OVERRIDES);

    expect(commands.some((cmd) => cmd.startsWith(RESTORE_SCRIPT))).toBe(true);
    expect(services.port).toBe(3000);
    expect(services.devCommand).toContain("PORT=3000 pnpm dev");
    // The chat alert (`startServicesWithRestoreAlert`) keys on this field.
    expect(services.restoreError).toContain("exit 127");
    expect(services.restoreError).toContain("supabase: command not found");
  });

  test("a successful restore reports no error", async () => {
    const { handle } = fakeHandle({
      hasDump: true,
      restore: { exitCode: 0, output: "restored supabase_db_web" },
    });

    const services = await startSessionServices(handle, "", OVERRIDES);

    expect(services.restoreError).toBeUndefined();
  });

  test("a sandbox without a seeded dump never attempts the restore", async () => {
    const { handle, commands } = fakeHandle({
      hasDump: false,
      restore: { exitCode: 127, output: "should not run" },
    });

    const services = await startSessionServices(handle, "", OVERRIDES);

    expect(commands).toHaveLength(1);
    expect(services.restoreError).toBeUndefined();
  });
});
