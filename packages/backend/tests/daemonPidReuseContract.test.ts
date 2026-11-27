import { spawn, execFileSync, execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  buildDaemonAliveCheckCmd,
  CALLBACK_LIVENESS_COMMAND,
  entityDaemonPaths,
} from "../convex/_sandbox_runtime/daemonPaths";

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
    }
  }
  return 0;
};

const bashDescribe = hasShellTools() ? describe : describe.skip;

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

bashDescribe("the watchdog liveness probe against real processes", () => {
  type Fixture = { dir: string; pid: number };

  const startProcess = async (scriptName: string): Promise<Fixture> => {
    const dir = mkdtempSync(join(tmpdir(), "eva-liveness-"));
    const script = join(dir, scriptName);
    const pidFile = join(dir, "proc.pid");
    writeFileSync(script, `echo $$ > ${pidFile}\nsleep 300\n`);
    spawn("setsid", ["bash", script], {
      detached: true,
      stdio: "ignore",
    }).unref();
    const pid = await readPid(pidFile);
    writeFileSync(join(dir, "run-design.pid"), String(pid));
    return { dir, pid };
  };

  const cleanup = (fixture: Fixture): void => {
    if (fixture.pid > 0) {
      try {
        process.kill(fixture.pid, "SIGKILL");
      } catch {
      }
    }
    rmSync(fixture.dir, { recursive: true, force: true });
  };

  const probeSaysAlive = (fixture: Fixture): boolean => {
    const cmd = CALLBACK_LIVENESS_COMMAND.replaceAll(
      "/tmp/run-design.",
      `${fixture.dir}/run-design.`,
    );
    try {
      execFileSync("bash", ["-c", cmd], { stdio: "ignore", timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  };

  test("the probe only reads markers it was pointed at", () => {
    expect(CALLBACK_LIVENESS_COMMAND).toContain("/tmp/run-design.pid");
    expect(CALLBACK_LIVENESS_COMMAND).toContain("/tmp/run-design.done");
  });

  test("a recycled pid owned by another service reads dead", async () => {
    const fixture = await startProcess("vite.js");
    try {
      expect(fixture.pid).toBeGreaterThan(0);
      expect(
        probeSaysAlive(fixture),
        "the watchdog granted grace to a pid the reboot gave to another service",
      ).toBe(false);
    } finally {
      cleanup(fixture);
    }
  }, 20_000);

  test("a live runner reads alive until it writes the done marker", async () => {
    const fixture = await startProcess("run-design.mjs");
    try {
      expect(fixture.pid).toBeGreaterThan(0);
      expect(
        probeSaysAlive(fixture),
        "the identity check rejected a genuine runner — the watchdog would kill live turns",
      ).toBe(true);
      writeFileSync(join(fixture.dir, "run-design.done"), "");
      expect(probeSaysAlive(fixture)).toBe(false);
    } finally {
      cleanup(fixture);
    }
  }, 20_000);
});
