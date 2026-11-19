import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
 * Sourcing it for real catches the quiet regression: moving the line into
 * `renderEvaEnvFile` single-quotes `$PATH` (wiping the shell's PATH).
 */

function pathAfterSourcing(envFile: string): string[] {
  const file = join(mkdtempSync(join(tmpdir(), "eva-env-")), ".eva-env.sh");
  writeFileSync(file, envFile);
  // --noprofile --norc: bash started without a terminal can still read the
  // machine's rc files (e.g. an Eva sandbox's PATH setup). Only the env file
  // under test may change PATH.
  return execFileSync(
    "bash",
    ["--noprofile", "--norc", "-c", `. "${file}" && printf %s "$PATH"`],
    { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8" },
  ).split(":");
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
});
