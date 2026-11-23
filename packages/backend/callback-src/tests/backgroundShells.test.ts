import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConvexCallType, JsonObject, JsonValue } from "../types.js";

const convexCalls = vi.hoisted(() => {
  const calls: { path: string; args: JsonObject }[] = [];
  return calls;
});

vi.mock("../http/convexClient.js", () => ({
  callConvexWithRetry: async (
    _type: ConvexCallType,
    path: string,
    args: JsonObject,
  ): Promise<JsonValue> => {
    convexCalls.push({ path, args });
    return null;
  },
}));

/** A fresh module per test: config reads the entity env at import time. */
async function loadForSession() {
  vi.stubEnv("AI_PROVIDER", "claude");
  vi.stubEnv("ENTITY_ID_FIELD", "sessionId");
  vi.stubEnv("ENTITY_ID", "s1");
  vi.resetModules();
  return import("../runtime/backgroundShells.js");
}

afterEach(() => {
  convexCalls.length = 0;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("backgroundShells", () => {
  it.each([
    ["Command running in background with ID: bash_2", "bash_2"],
    ["The command is running in the background with ID bash_3.", "bash_3"],
  ])("registers a backgrounded Bash on flush: %s", async (result, shellId) => {
    const shells = await loadForSession();
    shells.trackClaudeToolUse(
      "Bash",
      { command: "while true; do sleep 1; done" },
      "toolu_abc",
    );
    shells.trackClaudeToolResult("toolu_abc", result, false);
    await shells.flushBackgroundShellQueue();
    expect(convexCalls).toEqual([
      {
        path: "backgroundProcesses:register",
        args: {
          sessionId: "s1",
          key: "toolu_abc",
          command: "while true; do sleep 1; done",
          shellId,
        },
      },
    ]);
  });

  it("registers nothing for a foreground Bash result", async () => {
    const shells = await loadForSession();
    shells.trackClaudeToolUse("Bash", { command: "echo hi" }, "toolu_fg");
    shells.trackClaudeToolResult("toolu_fg", "exit code 0\nok", false);
    await shells.flushBackgroundShellQueue();
    expect(convexCalls).toEqual([]);
  });

  it("marks the shell exited on a successful KillShell", async () => {
    const shells = await loadForSession();
    shells.trackClaudeToolUse(
      "KillShell",
      { shell_id: "bash_9" },
      "toolu_kill",
    );
    shells.trackClaudeToolResult("toolu_kill", "killed", false);
    await shells.flushBackgroundShellQueue();
    expect(convexCalls).toEqual([
      {
        path: "backgroundProcesses:markExitedByShellId",
        args: { sessionId: "s1", shellId: "bash_9" },
      },
    ]);
  });
});
