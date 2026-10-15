import { expect, test } from "vitest";
import {
  buildFreePortLines,
  buildHttpReadyProbeCommand,
  buildPortListenProbeCommand,
} from "../convex/_sandbox_runtime/httpReadyProbe";
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

test("port listen probe falls back to /proc/net/tcp LISTEN rows", () => {
  const cmd = buildPortListenProbeCommand(13000, "busy", "free");
  expect(cmd).toContain("/proc/net/tcp");
  expect(cmd).toContain(":32C8 [0-9A-F]+:[0-9A-F]+ 0A ");
  expect(cmd.endsWith("echo free")).toBe(true);
});

test("free-port lines are one fuser/lsof if block", () => {
  expect(buildFreePortLines(3000)).toHaveLength(3);
});
