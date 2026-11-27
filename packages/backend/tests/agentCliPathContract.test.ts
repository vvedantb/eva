import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  AGENT_CLI_PATH_LINE,
  CLAUDE_CLI_INSTALL_DIR,
  CODEX_CLI_INSTALL_DIR,
  renderEvaEnvFile,
} from "../convex/_sandbox/vercelEnvFile";

function pathAfterSourcing(envFile: string): string[] {
  const file = join(mkdtempSync(join(tmpdir(), "eva-env-")), ".eva-env.sh");
  writeFileSync(file, envFile);
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
