import { describe, expect, test } from "vitest";
import {
  findFirstRunChatTurnRun,
  firstRunAssistantContent,
} from "./firstRunChatTurn";
import { findStreamingTargetMessage } from "@/lib/components/chat/chatBodyUtils";

// Regression guard for commit bc9af1efe.
//
// The rule used to pick the earliest run of *any* kind and only then check it
// for success, so a failed or cancelled first attempt swallowed the slot and
// the quick task opened with no assistant turn at all. It also had nothing
// excluding "Make changes" and Resolve Conflicts runs, which belong to their
// triggering comment / the timeline.
//
// Two surfaces read this one function — TaskSandboxChatPanel renders the run
// it returns as the opening chat turn, TaskDetailInline hides that same run
// from the activity timeline — so a disagreement here either duplicates the
// run on both surfaces or drops it from both.

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
    // listByTask returns newest-first, so the winner is rarely index 0.
    const runs = [
      run("late", { startedAt: 3_000 }),
      run("early", { startedAt: 1_000 }),
      run("middle", { startedAt: 2_000 }),
    ];
    expect(findFirstRunChatTurnRun(runs)?.label).toBe("early");
  });

  test("an earlier failed attempt does not swallow the slot", () => {
    // The bug: `error` sorted first, then failed the success check, and the
    // whole chat turn vanished even though a good run existed.
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
    // Its steps stream into the chat bubble instead of a timeline accordion.
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
    // The chat turn would render an empty assistant reply.
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
    // Runs that never launched have no startedAt; ordering must not collapse
    // to a single undefined bucket and hand the slot to an arbitrary run.
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

/**
 * The in-flight bubble is load-bearing but invisible in types: `ChatBody`
 * streams a run's live steps into the *first* assistant row that is empty and
 * has no `finishedAt` (findStreamingTargetMessage). Give the placeholder a
 * `finishedAt` — or any content — and the quick task simply shows a silent,
 * frozen bubble for the whole run, with nothing failing anywhere. Stamp one
 * onto a settled turn's row and it steals the *next* turn's tokens instead.
 *
 * So assert the shape through the real rule rather than field by field.
 */
describe("firstRunAssistantContent", () => {
  /** The row as ChatBody sees it, minus the ids the builder fills in. */
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
    // The bubble appears the moment the task is launched, before the sandbox
    // has booted — that gap is the longest stretch of an empty chat.
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
    // Runs recovered by the watchdog can settle without one; falling back to
    // startedAt keeps the row out of the streaming slot.
    const fields = firstRunAssistantContent({
      status: "error",
      activityLog: null,
      startedAt: 1_000,
    });
    expect(fields.finishedAt).toBe(1_000);
    expect(findStreamingTargetMessage([asRow(fields)])).toBeUndefined();
  });

  test("the placeholder does not carry an activity log key", () => {
    // The log row is only written on completion, so an in-flight run has none;
    // an empty-string log would also read as "no log" downstream.
    const fields = firstRunAssistantContent({
      status: "running",
      activityLog: "leftover",
      startedAt: 1_000,
    });
    expect(fields).toEqual({ content: "" });
  });
});
