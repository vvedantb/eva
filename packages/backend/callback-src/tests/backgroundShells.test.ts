import { afterEach, describe, expect, it, mock } from "bun:test";
import { stubEnv, unstubAllEnvs } from "../../tests/_helpers/env";
import { freshModules } from "./freshModules";
import type { ConvexCallType, JsonObject, JsonValue } from "../types.js";

const convexCalls: { path: string; args: JsonObject }[] = [];

mock.module("../http/convexClient.js", () => ({
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
  stubEnv("AI_PROVIDER", "claude");
  stubEnv("ENTITY_ID_FIELD", "sessionId");
  stubEnv("ENTITY_ID", "s1");
  freshModules();
  return import("../runtime/backgroundShells.js");
}

afterEach(() => {
  convexCalls.length = 0;
  unstubAllEnvs();
  freshModules();
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
