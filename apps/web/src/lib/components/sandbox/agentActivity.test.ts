import { describe, expect, it } from "vitest";
import type { ActivityStep } from "@vvedantb/ui";
import { deriveSubagents, subagentTone } from "./agentActivity";

function log(steps: ActivityStep[]): string {
  return JSON.stringify(steps);
}

const spawn = (
  toolUseId: string,
  overrides?: Partial<ActivityStep>,
): ActivityStep => ({
  type: "subtask",
  label: "Ran agent",
  detail: `agent ${toolUseId}`,
  status: "complete",
  toolUseId,
  ...overrides,
});

const child = (parentToolUseId: string, toolUseId: string): ActivityStep => ({
  type: "bash",
  label: "Ran command",
  status: "complete",
  toolUseId,
  parentToolUseId,
});

describe("deriveSubagents", () => {
  it("folds subtask steps and nests their children as the transcript", () => {
    const agents = deriveSubagents({
      activityLogs: [log([spawn("a1"), child("a1", "c1"), child("a1", "c2")])],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].toolUseId).toBe("a1");
    expect(agents[0].title).toBe("agent a1");
    expect(agents[0].status).toBe("completed");
    expect(agents[0].steps.map((s) => s.toolUseId)).toEqual(["c1", "c2"]);
  });

  it("does not double-count a turn present in both the log and streaming", () => {
    const persisted = [spawn("a1"), child("a1", "c1")];
    const streaming = [
      spawn("a1", { status: "active" }),
      child("a1", "c1"),
      child("a1", "c2"),
    ];
    const agents = deriveSubagents({
      activityLogs: [log(persisted)],
      streamingActivity: log(streaming),
    });
    expect(agents).toHaveLength(1);
    // Streaming is ahead of the persisted log, so its longer step list wins.
    expect(agents[0].steps.map((s) => s.toolUseId)).toEqual(["c1", "c2"]);
    expect(agents[0].status).toBe("running");
  });

  it("overlays lifecycle entries by toolUseId instead of adding rows", () => {
    const agents = deriveSubagents({
      activityLogs: [log([spawn("a1", { status: "active" })])],
      backgroundAgents: [
        {
          toolUseId: "a1",
          description: "explore the repo",
          status: "completed",
          backgrounded: true,
          startedAt: 1000,
          settledAt: 61000,
        },
      ],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].title).toBe("explore the repo");
    expect(agents[0].status).toBe("completed");
    expect(agents[0].backgrounded).toBe(true);
    expect(agents[0].startedAt).toBe(1000);
    expect(agents[0].settledAt).toBe(61000);
  });

  it("keeps lifecycle-only agents whose steps were never captured", () => {
    const agents = deriveSubagents({
      activityLogs: [],
      backgroundAgents: [{ toolUseId: "bg1", status: "running", startedAt: 5 }],
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].steps).toEqual([]);
    expect(subagentTone(agents[0].status)).toBe("active");
  });

  it("marks errored subtasks as failed and captures the result text", () => {
    const agents = deriveSubagents({
      activityLogs: [
        log([spawn("a1", { isError: true, output: { text: "boom" } })]),
      ],
    });
    expect(agents[0].status).toBe("failed");
    expect(subagentTone(agents[0].status)).toBe("danger");
    expect(agents[0].resultText).toBe("boom");
  });

  it("keeps spawn order across multiple messages", () => {
    const agents = deriveSubagents({
      activityLogs: [log([spawn("a1")]), log([spawn("a2")])],
    });
    expect(agents.map((a) => a.toolUseId)).toEqual(["a1", "a2"]);
  });

  it("downgrades running agents to stale when the sandbox is off", () => {
    const agents = deriveSubagents({
      activityLogs: [],
      backgroundAgents: [{ toolUseId: "bg1", status: "running", startedAt: 5 }],
      sandboxRunning: false,
    });
    expect(agents[0].status).toBe("stale");
    expect(subagentTone(agents[0].status)).toBe("muted");
  });

  it("ignores unparseable and empty logs", () => {
    expect(
      deriveSubagents({ activityLogs: ["not json", "[]", undefined] }),
    ).toEqual([]);
  });
});
