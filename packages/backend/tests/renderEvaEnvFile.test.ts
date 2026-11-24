import { expect, test } from "bun:test";
import {
  EVA_ENV_FILE,
  EVA_ENV_SOURCE_CMD,
  ensureEvaEnvInteractiveHookScript,
  renderEvaEnvFile,
  tmuxNewSessionWithEvaEnv,
} from "../convex/_sandbox/vercelEnvFile";

test("renderEvaEnvFile escapes single quotes for shell sourcing", () => {
  // Values like it's must become 'it'\''s' so `. .eva-env.sh` stays valid.
  expect(
    renderEvaEnvFile({
      FOO: "bar",
      NOTE: "it's fine",
    }),
  ).toBe("export FOO='bar'\nexport NOTE='it'\\''s fine'\n");
});

test("renderEvaEnvFile ends with a trailing newline", () => {
  expect(renderEvaEnvFile({ A: "1" }).endsWith("\n")).toBe(true);
});

test("tmuxNewSessionWithEvaEnv starts interactive bash with sandbox env sourced", () => {
  const cmd = tmuxNewSessionWithEvaEnv("eva_terminal", "/tmp/repo");
  expect(cmd).toContain("tmux new-session -d -s eva_terminal -c /tmp/repo");
  expect(cmd).toContain(EVA_ENV_SOURCE_CMD);
  expect(cmd).toContain("exec bash -i");
  expect(cmd).toContain(EVA_ENV_FILE);
});

test("ensureEvaEnvInteractiveHookScript installs profile.d and bashrc hooks", () => {
  const script = ensureEvaEnvInteractiveHookScript();
  expect(script).toContain("/etc/profile.d/eva-sandbox-env.sh");
  expect(script).toContain(EVA_ENV_SOURCE_CMD);
  expect(script).toContain("# eva-sandbox-env");
  expect(script).toContain("/home/eva/.bashrc");
  // vercel exec prefixes SOURCE_ENV with "; " — `do;` is invalid bash.
  expect(script).not.toMatch(/do\s*;/);
  // Safe when concatenated the same way vercelProvider.exec does.
  const withSourcePrefix = `${EVA_ENV_SOURCE_CMD}; ${script}`;
  expect(withSourcePrefix).not.toMatch(/do\s*;/);
});
