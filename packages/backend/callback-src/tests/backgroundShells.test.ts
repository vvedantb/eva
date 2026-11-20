import { describe, it, beforeEach, expect } from "bun:test";
import {
  backgroundShellQueueLengthForTests,
  matchBackgroundShellId,
  resetBackgroundShellsForTests,
  trackClaudeToolResult,
  trackClaudeToolUse,
} from "../runtime/backgroundShells.js";

describe("backgroundShells", () => {
  beforeEach(() => {
    resetBackgroundShellsForTests();
  });

  it("matches Claude Code background shell id wording", () => {
    expect(
      matchBackgroundShellId("Command running in background with ID: bash_1"),
    ).toBe("bash_1");
    expect(
      matchBackgroundShellId(
        "The command is running in the background with ID bash_3.",
      ),
    ).toBe("bash_3");
    expect(matchBackgroundShellId("exit code 0\nok")).toBe(null);
  });

  it("queues register on background Bash tool_result", () => {
    trackClaudeToolUse(
      "Bash",
      { command: "while true; do sleep 1; done" },
      "toolu_abc",
    );
    trackClaudeToolResult(
      "toolu_abc",
      "Command running in background with ID: bash_2",
      false,
    );
    expect(backgroundShellQueueLengthForTests()).toBe(1);
  });

  it("does not queue register for foreground Bash results", () => {
    trackClaudeToolUse("Bash", { command: "echo hi" }, "toolu_fg");
    trackClaudeToolResult("toolu_fg", "hi\n", false);
    expect(backgroundShellQueueLengthForTests()).toBe(0);
  });

  it("queues agent_killed on successful KillShell", () => {
    trackClaudeToolUse("KillShell", { shell_id: "bash_9" }, "toolu_kill");
    trackClaudeToolResult("toolu_kill", "killed", false);
    expect(backgroundShellQueueLengthForTests()).toBe(1);
  });
});
