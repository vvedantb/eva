import { describe, expect, it } from "vitest";
import type { ActivityStep } from "./activity-shared";
import {
  activitySegmentKey,
  activityStepKey,
  buildActivityRows,
  groupActivityRows,
  normalizeStep,
} from "./activity-tasks-utils";

function step(
  partial: Partial<ActivityStep> & Pick<ActivityStep, "type" | "label">,
): ActivityStep {
  return {
    status: "complete",
    ...partial,
  };
}

describe("normalizeStep", () => {
  it("drops legacy noise thinking labels", () => {
    expect(
      normalizeStep(
        step({ type: "thinking", label: "Generating response..." }),
      ),
    ).toBeNull();
  });

  it("remaps Thinking... with real detail to reasoning", () => {
    const result = normalizeStep(
      step({
        type: "thinking",
        label: "Thinking...",
        detail: "Considering the tradeoffs",
      }),
    );
    expect(result?.type).toBe("reasoning");
  });

  it("drops Thinking... with filler detail", () => {
    expect(
      normalizeStep(
        step({
          type: "thinking",
          label: "Thinking...",
          detail: "Claude is reasoning...",
        }),
      ),
    ).toBeNull();
  });

  it("passes through non-thinking steps", () => {
    const input = step({ type: "bash", label: "Ran command", detail: "ls" });
    expect(normalizeStep(input)).toEqual(input);
  });
});

describe("buildActivityRows", () => {
  it("emits one row per top-level step without consecutive merging", () => {
    const rows = buildActivityRows([
      step({ type: "bash", label: "a", detail: "ls" }),
      step({ type: "bash", label: "b", detail: "pwd" }),
      step({
        type: "read",
        label: "c",
        detail: "foo.ts",
        path: "/tmp/repo/foo.ts",
      }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.step.detail)).toEqual(["ls", "pwd", "foo.ts"]);
  });

  it("nests children under matching subtask toolUseId", () => {
    const rows = buildActivityRows([
      step({
        type: "subtask",
        label: "Ran agent",
        detail: "Explore codebase",
        toolUseId: "agent-1",
      }),
      step({
        type: "read",
        label: "Read",
        detail: "a.ts",
        path: "/tmp/repo/a.ts",
        parentToolUseId: "agent-1",
      }),
      step({
        type: "bash",
        label: "Ran",
        detail: "git status",
        parentToolUseId: "agent-1",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.children).toHaveLength(2);
    expect(rows[0]?.children?.[0]?.step.type).toBe("read");
    expect(rows[0]?.children?.[1]?.step.type).toBe("bash");
  });

  it("appends orphan children at top level", () => {
    const rows = buildActivityRows([
      step({
        type: "bash",
        label: "Ran",
        detail: "ls",
        parentToolUseId: "missing-parent",
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.step.detail).toBe("ls");
    expect(rows[0]?.children).toBeUndefined();
  });

  it("keeps a single todos step", () => {
    const rows = buildActivityRows([
      step({
        type: "todos",
        label: "Task list",
        todos: [{ content: "Ship it", status: "pending" }],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.step.type).toBe("todos");
  });
});

describe("groupActivityRows", () => {
  it("folds runs of actions between reasoning blocks", () => {
    const segments = groupActivityRows(
      buildActivityRows([
        step({ type: "reasoning", label: "Thought", detail: "Plan it" }),
        step({ type: "read", label: "Read", detail: "a.ts" }),
        step({ type: "bash", label: "Ran", detail: "ls" }),
        step({ type: "reasoning", label: "Thought", detail: "Now edit" }),
        step({ type: "edit", label: "Edited", detail: "a.ts" }),
      ]),
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "reasoning",
      "actions",
      "reasoning",
      "actions",
    ]);
    expect(segments[1]).toMatchObject({ kind: "actions" });
    expect(segments[1]?.kind === "actions" && segments[1].rows).toHaveLength(2);
  });

  it("keeps narration rows out of action groups", () => {
    const segments = groupActivityRows(
      buildActivityRows([
        step({ type: "bash", label: "Ran", detail: "ls" }),
        step({ type: "notice", label: "Context automatically compacting" }),
        step({ type: "bash", label: "Ran", detail: "pwd" }),
      ]),
    );
    expect(segments.map((s) => s.kind)).toEqual(["actions", "row", "actions"]);
  });

  it("splits action runs at mid-turn reply text", () => {
    const segments = groupActivityRows(
      buildActivityRows([
        step({ type: "response", label: "Response", detail: "Let me look." }),
        step({ type: "read", label: "Read", detail: "a.ts" }),
        step({ type: "response", label: "Response", detail: "Now the test." }),
        step({ type: "read", label: "Read", detail: "a.test.ts" }),
      ]),
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "response",
      "actions",
      "response",
      "actions",
    ]);
  });
});

describe("activityStepKey", () => {
  it("keeps the same key when label and status change", () => {
    const running = step({
      type: "bash",
      label: "Running command",
      status: "active",
      toolUseId: "toolu_1",
    });
    const done = step({
      type: "bash",
      label: "Ran command",
      status: "complete",
      toolUseId: "toolu_1",
      isError: true,
    });
    expect(activityStepKey(running, 0)).toBe(activityStepKey(done, 9));
    expect(activityStepKey(running, 0)).toBe("id:toolu_1");
  });

  it("does not collide two unlabeled steps of the same type", () => {
    const a = step({ type: "bash", label: "Running" });
    const b = step({ type: "bash", label: "Running" });
    expect(activityStepKey(a, 0)).not.toBe(activityStepKey(b, 1));
  });
});

describe("activitySegmentKey", () => {
  it("keeps an action group key when later rows append", () => {
    const first = step({
      type: "read",
      label: "Read",
      toolUseId: "toolu_read",
    });
    const before = groupActivityRows(buildActivityRows([first]));
    const after = groupActivityRows(
      buildActivityRows([
        first,
        step({ type: "bash", label: "Ran", toolUseId: "toolu_bash" }),
      ]),
    );
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    const beforeSeg = before[0];
    const afterSeg = after[0];
    if (beforeSeg === undefined || afterSeg === undefined) {
      throw new Error("expected action segments");
    }
    expect(activitySegmentKey(beforeSeg, 0)).toBe(
      activitySegmentKey(afterSeg, 0),
    );
    expect(activitySegmentKey(beforeSeg, 0)).toBe("actions:id:toolu_read");
  });

  it("identifies action groups by first-row id, not slice index", () => {
    const segments = groupActivityRows(
      buildActivityRows([
        step({ type: "reasoning", label: "Thought", detail: "a" }),
        step({ type: "bash", label: "Ran", toolUseId: "toolu_a" }),
        step({ type: "reasoning", label: "Thought", detail: "b" }),
        step({ type: "bash", label: "Ran", toolUseId: "toolu_b" }),
      ]),
    );
    const keyed = segments.map((segment, index) =>
      activitySegmentKey(segment, index),
    );
    expect(keyed[1]).toBe("actions:id:toolu_a");
    expect(keyed[3]).toBe("actions:id:toolu_b");
    expect(keyed.slice(-2)[1]).toBe("actions:id:toolu_b");
  });
});
