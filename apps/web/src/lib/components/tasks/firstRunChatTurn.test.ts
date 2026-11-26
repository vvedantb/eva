import { describe, expect, test } from "bun:test";
import {
  findFirstRunChatTurnRun,
  firstRunAssistantContent,
} from "./firstRunChatTurn";
import { findStreamingTargetMessage } from "@/lib/components/chat/chatBodyUtils";

type TestRun = {
  label: string;
  status: "queued" | "running" | "success" | "error" | "cancelled";
  mode?: "implementation" | "resolve_conflicts";
  resultSummary?: string;
  triggeringCommentId?: string;
  startedAt?: number;
  _creationTime: number;
};

const run = (label: string, fields: Partial<TestRun> = {}): TestRun => ({
  label,
  status: "success",
  resultSummary: "Done",
  _creationTime: 1_000,
  ...fields,
});

describe("findFirstRunChatTurnRun", () => {
  test("no runs → no chat turn", () => {
    expect(findFirstRunChatTurnRun(undefined)).toBeUndefined();
    expect(findFirstRunChatTurnRun([])).toBeUndefined();
  });

  test("picks the earliest run regardless of input order", () => {
    const runs = [
      run("late", { startedAt: 3_000 }),
      run("early", { startedAt: 1_000 }),
      run("middle", { startedAt: 2_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("early");
  });

  test("an earlier failed attempt does not swallow the slot", () => {
    const runs = [
      run("failed", {
        status: "error",
        resultSummary: undefined,
        startedAt: 1_000,
      }),
      run("succeeded", { startedAt: 2_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("succeeded");
  });

  test("an earlier cancelled attempt does not swallow the slot", () => {
    const runs = [
      run("cancelled", {
        status: "cancelled",
        resultSummary: undefined,
        startedAt: 1_000,
      }),
      run("succeeded", { startedAt: 2_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("succeeded");
  });

  test("a run still in flight owns the chat turn", () => {
    const runs = [
      run("running", { status: "running", resultSummary: undefined }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("running");
  });

  test("a queued run owns the chat turn too", () => {
    const runs = [run("queued", { status: "queued", resultSummary: undefined })];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("queued");
  });

  test("an in-flight Resolve Conflicts run stays in the timeline", () => {
    const runs = [
      run("conflicts", {
        status: "running",
        mode: "resolve_conflicts",
        resultSummary: undefined,
      }),
    ];
    expect(findFirstRunChatTurnRun(runs)).toBeUndefined();
  });

  test('an in-flight "Make changes" run stays with its comment', () => {
    const runs = [
      run("make-changes", {
        status: "running",
        triggeringCommentId: "comment-1",
        resultSummary: undefined,
      }),
    ];
    expect(findFirstRunChatTurnRun(runs)).toBeUndefined();
  });

  test("a success with no resultSummary stays in the timeline", () => {
    const runs = [run("summaryless", { resultSummary: undefined })];
    expect(findFirstRunChatTurnRun(runs)).toBeUndefined();
  });

  test('"Make changes" runs belong to their comment, not the chat turn', () => {
    const runs = [run("make-changes", { triggeringCommentId: "comment-1" })];
    expect(findFirstRunChatTurnRun(runs)).toBeUndefined();
  });

  test("Resolve Conflicts runs stay in the timeline", () => {
    const runs = [run("conflicts", { mode: "resolve_conflicts" })];
    expect(findFirstRunChatTurnRun(runs)).toBeUndefined();
  });

  test("excluded runs never outrank the eligible one, however early they are", () => {
    const runs = [
      run("conflicts", { mode: "resolve_conflicts", startedAt: 100 }),
      run("make-changes", { triggeringCommentId: "comment-1", startedAt: 200 }),
      run("failed", {
        status: "error",
        resultSummary: undefined,
        startedAt: 300,
      }),
      run("initial", { startedAt: 400 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("initial");
  });

  test("falls back to _creationTime when startedAt is absent", () => {
    const runs = [
      run("newer", { _creationTime: 2_000 }),
      run("older", { _creationTime: 1_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("older");
  });

  test("compares a startedAt run against a _creationTime-only run", () => {
    const runs = [
      run("started-later", { startedAt: 5_000, _creationTime: 4_000 }),
      run("created-earlier", { _creationTime: 3_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("created-earlier");
  });
});

describe("firstRunAssistantContent", () => {
  const asRow = (
    fields: ReturnType<typeof firstRunAssistantContent>,
  ): { role: "assistant"; content: string; finishedAt?: number } => ({
    role: "assistant",
    ...fields,
  });

  test("a running run renders the live streaming placeholder", () => {
    const fields = firstRunAssistantContent({
      status: "running",
      activityLog: null,
      startedAt: 1_000,
    });
    expect(fields.content).toBe("");
    expect(findStreamingTargetMessage([asRow(fields)])).toBeDefined();
  });

  test("a queued run renders it too", () => {
    const fields = firstRunAssistantContent({
      status: "queued",
      activityLog: null,
      startedAt: 1_000,
    });
    expect(findStreamingTargetMessage([asRow(fields)])).toBeDefined();
  });

  test("a settled run is never mistaken for the placeholder", () => {
    const fields = firstRunAssistantContent({
      status: "success",
      resultSummary: "Done",
      finishedAt: 2_000,
      activityLog: "step one",
      startedAt: 1_000,
    });
    expect(fields).toEqual({
      content: "Done",
      activityLog: "step one",
      finishedAt: 2_000,
    });
    expect(findStreamingTargetMessage([asRow(fields)])).toBeUndefined();
  });

  test("a settled run with no finishedAt still closes its bubble", () => {
    const fields = firstRunAssistantContent({
      status: "error",
      activityLog: null,
      startedAt: 1_000,
    });
    expect(fields.finishedAt).toBe(1_000);
    expect(findStreamingTargetMessage([asRow(fields)])).toBeUndefined();
  });

  test("the placeholder does not carry an activity log key", () => {
    const fields = firstRunAssistantContent({
      status: "running",
      activityLog: "leftover",
      startedAt: 1_000,
    });
    expect(fields).toEqual({ content: "" });
  });
});
