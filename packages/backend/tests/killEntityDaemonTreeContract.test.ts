import { spawn, execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  buildKillEntityDaemonCmd,
  entityDaemonPaths,
} from "../convex/_sandbox_runtime/daemonPaths";

/**
 * Respawning a warm daemon is a kill followed by a relaunch ~1s later, and the
 * kill has to take the daemon's CHILDREN with it: the Claude Code CLI the SDK
 * spawns inherits the `flock -n -E 217` fd the runner was launched under, so an
 * orphaned child keeps the per-entity spawn lock held and the relaunch exits
 * 217 with nobody left polling claimPendingTurn. It also has to be synchronous
 * enough that the relaunch does not race the exit. Both properties live purely
 * in a generated shell string, so they are pinned here.
 */
describe("buildKillEntityDaemonCmd reaps the daemon's process tree", () => {
  const cmd = buildKillEntityDaemonCmd("sessionId", "sess123");

  test("walks the tree by parent pid, never by command line", () => {
    expect(cmd).toContain('pgrep -P "$1"');
    // `pgrep -f`/`pkill -f` match command lines, so they would match the
    // `bash -lc` wrapper running this very snippet and kill the exec itself.
    expect(cmd).not.toContain("pgrep -f");
    expect(cmd).not.toContain("pkill -f");
    expect(cmd).not.toContain("pkill");
  });

  test("escalates SIGTERM to SIGKILL after waiting for the root to exit", () => {
    expect(cmd).toContain("TERM");
    expect(cmd).toContain("KILL");
    expect(cmd).toContain('kill -0 "$pid"');
    // 15 polls x 0.2s == ~3s per pidfile, and at most two pidfiles are reaped,
    // which has to fit inside the callers' 10s exec timeout.
    expect(cmd).toContain("seq 1 15");
    expect(cmd).toContain("sleep 0.2");
  });

  test("reaps the scoped and legacy pidfiles and removes their markers", () => {
    const scoped = entityDaemonPaths("sessionId", "sess123");
    expect(cmd).toContain(`reap ${JSON.stringify(scoped.pid)}`);
    expect(cmd).toContain(`rm -f ${JSON.stringify(scoped.pid)}`);
    expect(cmd).toContain('reap "/tmp/eva-daemon.pid"');
    expect(cmd).toContain('rm -f "/tmp/eva-daemon.pid"');
  });

  test("only sessionId entities carry the legacy markers", () => {
    expect(buildKillEntityDaemonCmd("agentTaskId", "t1")).not.toContain(
      "/tmp/eva-daemon.pid",
    );
  });

  test("ends with `true` so a missing daemon is not an exec failure", () => {
    expect(cmd.endsWith("; true")).toBe(true);
  });
});

function hasShellTools(): boolean {
  try {
    execSync("command -v bash && command -v pgrep && command -v setsid", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const readPid = async (file: string): Promise<number> => {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const pid = Number(readFileSync(file, "utf8").trim());
      if (pid > 0) return pid;
    } catch {
      /* not written yet */
    }
  }
  return 0;
};

const bashDescribe = hasShellTools() ? describe : describe.skip;

/**
 * The unit assertions above cannot catch a snippet that is merely valid — e.g.
 * a `kill_tree` recursion that drops the signal argument, or a wait loop that
 * never escalates. So run the real command against a real two-level tree.
 */
bashDescribe("the generated command kills a real process tree", () => {
  test("the daemon and its child are both dead once the command returns", async () => {
    // A non-sessionId field so the run never touches the legacy
    // /tmp/eva-daemon.pid of a daemon that may be live on this machine.
    const entityId = randomUUID();
    const paths = entityDaemonPaths("testEntityId", entityId);
    const dir = mkdtempSync(join(tmpdir(), "eva-kill-tree-"));
    const script = join(dir, "tree.sh");
    const parentPidFile = join(dir, "parent.pid");
    const childPidFile = join(dir, "child.pid");
    writeFileSync(
      script,
      `echo $$ > ${parentPidFile}\nsleep 300 &\necho $! > ${childPidFile}\nwait\n`,
    );

    // setsid so the tree's parent is init, not vitest: node reaps its own
    // children asynchronously, and a zombie still answers `kill -0`, which
    // would push the wait loop to its SIGKILL fallback for the wrong reason.
    spawn("setsid", ["bash", script], {
      detached: true,
      stdio: "ignore",
    }).unref();

    let parentPid = 0;
    let childPid = 0;
    try {
      parentPid = await readPid(parentPidFile);
      childPid = await readPid(childPidFile);
      expect(parentPid).toBeGreaterThan(0);
      expect(childPid).toBeGreaterThan(0);
      expect(pidAlive(childPid)).toBe(true);

      writeFileSync(paths.pid, String(parentPid));
      execFileSync(
        "bash",
        ["-c", buildKillEntityDaemonCmd("testEntityId", entityId)],
        { stdio: "ignore", timeout: 10_000 },
      );

      expect(
        pidAlive(parentPid),
        "the command returned before the daemon exited",
      ).toBe(false);
      expect(
        pidAlive(childPid),
        "the daemon's child outlived it and would keep the inherited flock fd held",
      ).toBe(false);
    } finally {
      for (const pid of [childPid, parentPid]) {
        if (pid > 0) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
      rmSync(paths.pid, { force: true });
    }
  }, 20_000);
});
