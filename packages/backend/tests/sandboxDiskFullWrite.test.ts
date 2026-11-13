import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type {
  SandboxExecResult,
  SandboxHandle,
} from "../convex/_sandbox/provider";
import {
  buildReclaimDiskScript,
  isDiskFull,
  LOW_DISK_CLEANUP_MIB,
  parseReclaimDiskOutput,
  SandboxDiskFullError,
  writeSandboxFile,
} from "../convex/_sandbox_runtime/sandboxFiles";
import { buildEnsureSwapScript } from "../convex/_sandbox_runtime/swap";

/**
 * Prod 2026-11-09: a session resume died with
 * `reuseSessionSandbox.prepare: Status code 400 is not ok: The submitted
 * tarball could not be extracted`. Vercel `writeFiles` ships a tarball and
 * extracts it in the VM; the disk was full (an exec on the same VM logged
 * `No space left on device`), so every eva script write failed and the
 * session could never resume.
 */

// The exact provider message from the incident.
const EXTRACT_ERROR = new Error(
  "Status code 400 is not ok: The submitted tarball could not be extracted",
);

function fakeHandle(opts: {
  /** One entry per writeFile call; `null` succeeds. */
  writeResults: Array<Error | null>;
  /** Output of the reclaim exec. */
  reclaimOutput: string;
}): { handle: SandboxHandle; execs: string[]; writes: string[] } {
  const execs: string[] = [];
  const writes: string[] = [];
  const outOfScope = (member: string): never => {
    throw new Error(`fake sandbox: ${member} is out of scope for this test`);
  };
  const handle: SandboxHandle = {
    id: "fake-sandbox",
    state: "running",
    errorReason: null,
    classifyForReconcile: () => Promise.resolve("alive"),
    exec: async (cmd: string): Promise<SandboxExecResult> => {
      execs.push(cmd);
      return { exitCode: 0, output: opts.reclaimOutput };
    },
    writeFile: async (path: string) => {
      writes.push(path);
      const result = opts.writeResults[writes.length - 1] ?? null;
      if (result) throw result;
    },
    execDetached: () => outOfScope("execDetached"),
    start: () => outOfScope("start"),
    stop: () => outOfScope("stop"),
    archive: () => outOfScope("archive"),
    extendTimeout: () => outOfScope("extendTimeout"),
    delete: () => outOfScope("delete"),
    refresh: () => outOfScope("refresh"),
    previewUrl: () => outOfScope("previewUrl"),
    createSnapshot: () => outOfScope("createSnapshot"),
    git: {
      branches: () => outOfScope("git.branches"),
      clone: () => outOfScope("git.clone"),
      checkoutBranch: () => outOfScope("git.checkoutBranch"),
    },
  };
  return { handle, execs, writes };
}

const FREED =
  "eva-disk: before_mib=0 free_mib=6144 free_inodes=900000 swapfile=removed";
const STILL_FULL =
  "eva-disk: before_mib=0 free_mib=0 free_inodes=900000 swapfile=none";

describe("writeSandboxFile on a full disk", () => {
  test("reclaims eva-owned space and retries once", async () => {
    const { handle, execs, writes } = fakeHandle({
      writeResults: [EXTRACT_ERROR, null],
      reclaimOutput: FREED,
    });

    await writeSandboxFile(handle, "/tmp/eva-ensure-swap.sh", "echo hi");

    expect(writes).toEqual([
      "/tmp/eva-ensure-swap.sh",
      "/tmp/eva-ensure-swap.sh",
    ]);
    // One inline exec: a full disk cannot take a script file.
    expect(execs).toEqual([buildReclaimDiskScript()]);
  });

  test("names the full disk when the retry still fails", async () => {
    const { handle } = fakeHandle({
      writeResults: [EXTRACT_ERROR, EXTRACT_ERROR],
      reclaimOutput: STILL_FULL,
    });

    const failure = writeSandboxFile(handle, "/tmp/a.sh", "x");
    await expect(failure).rejects.toBeInstanceOf(SandboxDiskFullError);
    await expect(failure).rejects.toThrow(
      /Sandbox disk is full \(free=0MiB.*could not write \/tmp\/a\.sh/,
    );
  });

  test("does not blame the disk when space is free", async () => {
    // The same provider message can mean another extract failure (for example
    // a permission problem). With free space, keep the original error.
    const { handle } = fakeHandle({
      writeResults: [EXTRACT_ERROR, EXTRACT_ERROR],
      reclaimOutput: FREED,
    });

    await expect(writeSandboxFile(handle, "/tmp/a.sh", "x")).rejects.toBe(
      EXTRACT_ERROR,
    );
  });

  test("other write errors skip the reclaim", async () => {
    const other = new Error("Status code 500 is not ok: internal");
    const { handle, execs, writes } = fakeHandle({
      writeResults: [other],
      reclaimOutput: FREED,
    });

    await expect(writeSandboxFile(handle, "/tmp/a.sh", "x")).rejects.toBe(
      other,
    );
    expect(execs).toEqual([]);
    expect(writes).toHaveLength(1);
  });
});

describe("reclaim script", () => {
  const script = buildReclaimDiskScript();

  test("is valid bash and small enough to run inline", () => {
    execFileSync("bash", ["-n"], { input: script });
    expect(Buffer.byteLength(script)).toBeLessThan(2048);
  });

  test("deletes the swapfile only when it is not active swap", () => {
    const activeCheck = script.indexOf("swapon --show=NAME");
    const remove = script.indexOf('rm -f "$SWAP"');
    expect(activeCheck).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(activeCheck);
    expect(script).toContain("SWAPFILE=active");
    expect(script.match(/rm -f "\$SWAP"/g)).toHaveLength(2);
  });

  test("deletes caches only below the low-disk line, never user work", () => {
    const guard = script.indexOf(
      `if [ "$(free_mib)" -lt ${LOW_DISK_CLEANUP_MIB} ]`,
    );
    const firstCacheRm = script.indexOf("rm -rf");
    expect(guard).toBeGreaterThan(-1);
    expect(firstCacheRm).toBeGreaterThan(guard);
    for (const userPath of ["/tmp/repo", "node_modules", ".next", ".convex"]) {
      expect(script).not.toContain(userPath);
    }
    expect(script).toContain("cleaned=${CLEANED}");
  });

  test("run for real, it removes an inactive swapfile and reports free disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "eva-reclaim-"));
    const swap = join(dir, "swapfile");
    writeFileSync(swap, "leftover");
    try {
      const output = execFileSync("bash", ["-s"], {
        input: script.replace("SWAP=/swapfile", `SWAP=${swap}`),
        encoding: "utf8",
      });
      const report = parseReclaimDiskOutput(output);
      expect(existsSync(swap)).toBe(false);
      expect(report.status).toContain("swapfile=removed");
      expect(report.freeMib).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("output parses into free space and inode counts", () => {
    expect(parseReclaimDiskOutput(`noise\n${FREED}\n`)).toEqual({
      freeMib: 6144,
      freeInodes: 900000,
      status: FREED,
    });
    expect(parseReclaimDiskOutput("")).toEqual({
      freeMib: -1,
      freeInodes: -1,
      status: "",
    });
  });

  test("full means low space or low inodes, never unknown", () => {
    const report = (freeMib: number, freeInodes: number) => ({
      freeMib,
      freeInodes,
      status: "",
    });
    expect(isDiskFull(report(0, 900000))).toBe(true);
    expect(isDiskFull(report(6144, 10))).toBe(true);
    expect(isDiskFull(report(6144, 900000))).toBe(false);
    expect(isDiskFull(report(-1, -1))).toBe(false);
  });
});

describe("swap no longer keeps a leftover swapfile on a tight disk", () => {
  const script = buildEnsureSwapScript({
    sizeMib: 6144,
    reserveMib: 5120,
    minMib: 2048,
  });

  test("a leftover below the free-disk reserve is dropped, not reused", () => {
    expect(script).toContain('[ "${free_now:-$RESERVE}" -lt "$RESERVE" ]');
    const dropCheck = script.indexOf("free_now:-$RESERVE");
    const reuse = script.indexOf("eva-swap:reused");
    expect(dropCheck).toBeGreaterThan(-1);
    expect(dropCheck).toBeLessThan(reuse);
  });

  test("is still valid bash", () => {
    execFileSync("bash", ["-n"], { input: script });
  });
});
