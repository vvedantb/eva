import { spawn, execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  buildDaemonAliveCheckCmd,
  entityDaemonPaths,
} from "../convex/_sandbox_runtime/daemonPaths";

/**
 * Session 238 (25 Sep 2026). The sandbox was stopped overnight and resumed at
 * 08:20. Everything under /tmp came back with it — the daemon pidfile, the
 * entity and opts markers, the callback fingerprint — but the VM had rebooted,
 * so pid allocation restarted from 1 and the resume's own services took the
 * range the dead daemon's pid sat in (daemon 1172; vite 986, Convex 1070/1089,
 * executor 1189). The alive-check's `kill -0` therefore passed against an
 * unrelated live process: `prewarmEntityDaemon` logged "already warm" 20+ times
 * over 45 minutes, no daemon ever existed to claim a turn, and three prompts
 * failed as "Turn stalled".
 *
 * The fix is an identity check, so the property to pin is exactly that: pid
 * liveness is necessary but never sufficient.
 */
describe("the daemon alive-check proves identity, not just liveness", () => {
  const cmd = buildDaemonAliveCheckCmd("sessionId", "sess123", "fp1", "opts1");

  test("liveness goes through the shared runner-identity helper", () => {
    expect(cmd).toContain("eva_pid_live");
    expect(cmd).toContain("/proc/$p/cmdline");
    expect(cmd).toContain("run-design[.]mjs");
  });

  test("no bare kill -0 survives as the whole verdict", () => {
    const afterHelper = cmd.slice(cmd.indexOf("; if "));
    expect(
      afterHelper,
      "a second liveness path would reopen the bug the helper closes",
    ).not.toContain("kill -0");
  });

  test("an unreadable procfs degrades to the kill -0 verdict, not to cold", () => {
    expect(cmd).toContain('[ -r "/proc/$p/cmdline" ] || return 0');
  });
});

function hasShellTools(): boolean {
  try {
    execSync("command -v bash && command -v setsid && command -v tr", {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

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
 * The assertions above only read the string. Run it against real processes:
 * the whole bug was a snippet that looked right and answered wrong.
 */
bashDescribe("the generated alive-check against real processes", () => {
  type Fixture = {
    dir: string;
    pid: number;
    entityId: string;
    paths: ReturnType<typeof entityDaemonPaths>;
  };

  const startFixture = async (scriptName: string): Promise<Fixture> => {
    const entityId = randomUUID();
    const paths = entityDaemonPaths("testEntityId", entityId);
    const dir = mkdtempSync(join(tmpdir(), "eva-pid-reuse-"));
    const script = join(dir, scriptName);
    const pidFile = join(dir, "proc.pid");
    writeFileSync(script, `echo $$ > ${pidFile}\nsleep 300\n`);
    spawn("setsid", ["bash", script], {
      detached: true,
      stdio: "ignore",
    }).unref();
    const pid = await readPid(pidFile);
    writeFileSync(paths.pid, String(pid));
    writeFileSync(paths.entity, entityId);
    writeFileSync(paths.opts, "opts1");
    return { dir, pid, entityId, paths };
  };

  const cleanup = (fixture: Fixture): void => {
    if (fixture.pid > 0) {
      try {
        process.kill(fixture.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    rmSync(fixture.dir, { recursive: true, force: true });
    for (const path of Object.values(fixture.paths)) {
      rmSync(path, { force: true });
    }
  };

  const verdict = (fixture: Fixture): string =>
    execFileSync(
      "bash",
      [
        "-c",
        buildDaemonAliveCheckCmd(
          "testEntityId",
          fixture.entityId,
          "fp1",
          "opts1",
        ),
      ],
      { encoding: "utf8", timeout: 10_000 },
    ).trim();

  // The fingerprint lives at the fixed /tmp/eva-callback-fp, which a real
  // daemon on this machine owns, so the fixtures never write it. That is enough
  // to tell the two cases apart: the pid branch is evaluated BEFORE the
  // fingerprint, so only a pid that passes the identity gate reaches "stale".
  test("a live process that is not the runner reads cold", async () => {
    const fixture = await startFixture("vite.js");
    try {
      expect(fixture.pid).toBeGreaterThan(0);
      expect(
        verdict(fixture),
        "a recycled pid was accepted as this entity's daemon",
      ).toBe("cold");
    } finally {
      cleanup(fixture);
    }
  }, 20_000);

  test("a live runner still passes the pid gate", async () => {
    const fixture = await startFixture("run-design.mjs");
    try {
      expect(fixture.pid).toBeGreaterThan(0);
      expect(
        verdict(fixture),
        "the identity check rejected a genuine daemon — every turn would cold-start",
      ).not.toBe("cold");
    } finally {
      cleanup(fixture);
    }
  }, 20_000);
});
