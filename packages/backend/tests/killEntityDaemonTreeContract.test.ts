import { spawn, execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  buildKillEntityDaemonCmd,
  entityDaemonPaths,
} from "../convex/_sandbox_runtime/daemonPaths";

describe("buildKillEntityDaemonCmd reaps the daemon's process tree", () => {
  const cmd = buildKillEntityDaemonCmd("chatId", "chat123");

  test("walks the tree by parent pid, never by command line", () => {
    expect(cmd).toContain('pgrep -P "$1"');
    expect(cmd).not.toContain("pgrep -f");
    expect(cmd).not.toContain("pkill -f");
    expect(cmd).not.toContain("pkill");
  });

  test("escalates SIGTERM to SIGKILL after waiting for the root to exit", () => {
    expect(cmd).toContain("TERM");
    expect(cmd).toContain("KILL");
    expect(cmd).toContain('kill -0 "$pid"');
    expect(cmd).toContain("seq 1 15");
    expect(cmd).toContain("sleep 0.2");
  });

  test("reaps the entity's pidfile and removes its markers", () => {
    const scoped = entityDaemonPaths("chatId", "chat123");
    expect(cmd).toContain(`reap ${JSON.stringify(scoped.pid)}`);
    expect(cmd).toContain(`rm -f ${JSON.stringify(scoped.pid)}`);
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

const processGone = (pid: number): boolean => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z");
  } catch {
    return !pidAlive(pid);
  }
};

const goneWithin = async (pid: number, ms: number): Promise<boolean> => {
  for (let waited = 0; waited < ms; waited += 20) {
    if (processGone(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return processGone(pid);
};

const readPid = async (file: string): Promise<number> => {
  for (let i = 0; i < 50; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const pid = Number(readFileSync(file, "utf8").trim());
      if (pid > 0) return pid;
    } catch {
    }
  }
  return 0;
};

const bashDescribe = hasShellTools() ? describe : describe.skip;

bashDescribe("the generated command kills a real process tree", () => {
  test("the daemon and its child are both dead once the command returns", async () => {
    const entityId = randomUUID();
    const paths = entityDaemonPaths("testEntityId", entityId);
    const dir = mkdtempSync(join(tmpdir(), "eva-kill-tree-"));
    const script = join(dir, "run-design.mjs");
    const parentPidFile = join(dir, "parent.pid");
    const childPidFile = join(dir, "child.pid");
    writeFileSync(
      script,
      `echo $$ > ${parentPidFile}\nsleep 300 &\necho $! > ${childPidFile}\nwait\n`,
    );

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
        await goneWithin(childPid, 1_000),
        "the daemon's child outlived it and would keep the inherited flock fd held",
      ).toBe(true);
    } finally {
      for (const pid of [childPid, parentPid]) {
        if (pid > 0) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
          }
        }
      }
      rmSync(dir, { recursive: true, force: true });
      rmSync(paths.pid, { force: true });
    }
  }, 20_000);

  test("a pidfile whose pid was recycled by an unrelated process is spared", async () => {
    const entityId = randomUUID();
    const paths = entityDaemonPaths("testEntityId", entityId);
    const dir = mkdtempSync(join(tmpdir(), "eva-kill-bystander-"));
    const script = join(dir, "bystander.sh");
    const pidFile = join(dir, "bystander.pid");
    writeFileSync(script, `echo $$ > ${pidFile}\nsleep 300\n`);

    spawn("setsid", ["bash", script], {
      detached: true,
      stdio: "ignore",
    }).unref();

    let bystanderPid = 0;
    try {
      bystanderPid = await readPid(pidFile);
      expect(bystanderPid).toBeGreaterThan(0);

      writeFileSync(paths.pid, String(bystanderPid));
      execFileSync(
        "bash",
        ["-c", buildKillEntityDaemonCmd("testEntityId", entityId)],
        { stdio: "ignore", timeout: 10_000 },
      );

      expect(
        pidAlive(bystanderPid),
        "reap signalled a process that is not a callback runner",
      ).toBe(true);
    } finally {
      if (bystanderPid > 0) {
        try {
          process.kill(bystanderPid, "SIGKILL");
        } catch {
        }
      }
      rmSync(dir, { recursive: true, force: true });
      rmSync(paths.pid, { force: true });
    }
  }, 20_000);
});
