import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  AGENT_CLI_PATH_LINE,
  CLAUDE_CLI_INSTALL_DIR,
  CODEX_CLI_INSTALL_DIR,
  renderEvaEnvFile,
} from "../convex/_sandbox/vercelEnvFile";

/**
 * Fix #867: launches install the registry-latest Claude Code / Codex CLI under
 * /tmp, but terminal shells found the snapshot's older copy first, so `claude`
 * typed in a terminal ran a different version from the agent. `.eva-env.sh`
 * now ends with a PATH line putting both install dirs first.
 *
 * Sourcing it for real catches the quiet regressions: moving the line into
 * `renderEvaEnvFile` single-quotes `$PATH` (wiping the shell's PATH), and a
 * launch-side install dir drifting from the PATH dirs reintroduces the bug.
 */

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (rel: string): string =>
  readFileSync(join(backendDir, rel), "utf8");

function pathAfterSourcing(envFile: string): string[] {
  const file = join(mkdtempSync(join(tmpdir(), "eva-env-")), ".eva-env.sh");
  writeFileSync(file, envFile);
  return execFileSync("bash", ["-c", `. "${file}" && printf %s "$PATH"`], {
    env: { PATH: "/usr/bin:/bin" },
    encoding: "utf8",
  }).split(":");
}

describe("terminal shells resolve the launch-installed agent CLIs first", () => {
  test("sourcing the env file prepends both install dirs and keeps PATH", () => {
    const envFile =
      renderEvaEnvFile({ GITHUB_TOKEN: "t" }) + AGENT_CLI_PATH_LINE;
    expect(pathAfterSourcing(envFile)).toEqual([
      `${CLAUDE_CLI_INSTALL_DIR}/bin`,
      `${CODEX_CLI_INSTALL_DIR}/bin`,
      "/usr/bin",
      "/bin",
    ]);
  });

  test("createSandbox appends the PATH line to the rendered env file", () => {
    expect(readSource("convex/_sandbox_runtime/git.ts")).toMatch(
      /\}\) \+ AGENT_CLI_PATH_LINE,/,
    );
  });

  test("launch installs into the same dirs the PATH line names", () => {
    const launch = readSource("convex/_sandbox_runtime/launch.ts");
    expect(launch).toContain(
      "const CLAUDE_FALLBACK_INSTALL_DIR = CLAUDE_CLI_INSTALL_DIR;",
    );
    expect(launch).toContain(
      "const CODEX_FALLBACK_INSTALL_DIR = CODEX_CLI_INSTALL_DIR;",
    );
  });
});
