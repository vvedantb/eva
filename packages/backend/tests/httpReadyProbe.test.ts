import { expect, test } from "vitest";
import { buildHttpReadyProbeCommand } from "../convex/_sandbox_runtime/httpReadyProbe";
import { gitRemoteAuthPrefix } from "../convex/_sandbox_runtime/gitRemoteCommand";

test("HTTP ready probe quotes the URL and uses caller tokens", () => {
  const cmd = buildHttpReadyProbeCommand({
    url: "http://127.0.0.1:9222/json/version",
    attempts: 20,
    sleepSec: 0.5,
    onReady: "exit 0",
    onTimeout: "exit 0",
  });
  expect(cmd).toContain("seq 1 20");
  expect(cmd).toContain("curl -fsS");
  expect(cmd).toContain("json/version");
  expect(cmd.endsWith("exit 0")).toBe(true);
});

test("git remote prefix strips the GitHub extraheader and disables prompts", () => {
  const prefix = gitRemoteAuthPrefix(
    "/tmp/repo",
    "https://github.com/acme/eva.git",
  );
  expect(prefix).toContain("http.https://github.com/.extraheader");
  expect(prefix).toContain("git remote set-url origin");
  expect(prefix).toContain("GIT_TERMINAL_PROMPT=0");
  expect(prefix).not.toContain("x-access-token");
});
