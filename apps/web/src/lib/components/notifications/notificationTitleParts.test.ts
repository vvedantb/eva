import { describe, expect, test } from "vitest";
import { splitNotificationTitle } from "./notificationTitleParts";

/**
 * Every case below is a title format the Convex backend actually writes, so a
 * change to one of those strings should break this file rather than quietly
 * push the boilerplate back onto line one of the inbox row.
 *
 * Sources: `githubWebhook.ts` (PR merged/closed), `_agentRuns/mutations.ts` and
 * `_taskWorkflow/runLifecycle.ts` (run outcomes), `_agentTasks/mutations.ts`
 * (assignment, completion, status moves), `taskComments.ts` / `docComments.ts`
 * (comments, mentions, replies).
 */
describe("splitNotificationTitle", () => {
  test("lifts a quoted subject out and keeps both halves of the event", () => {
    expect(
      splitNotificationTitle({
        title: 'PR #678 merged — "Delegate to Opus sub-agents" archived',
      }),
    ).toEqual({
      subject: "Delegate to Opus sub-agents",
      event: "PR #678 merged · session archived",
    });
    expect(
      splitNotificationTitle({ title: 'PR closed — "Fix login" moved to done' }),
    ).toEqual({ subject: "Fix login", event: "PR closed · moved to done" });
    expect(
      splitNotificationTitle({
        title: 'PR #664 closed — "Fix login" archived',
      }),
    ).toEqual({
      subject: "Fix login",
      event: "PR #664 closed · session archived",
    });
  });

  test("drops the colon after a leading event word", () => {
    expect(splitNotificationTitle({ title: 'Assigned: "Fix login"' })).toEqual({
      subject: "Fix login",
      event: "Assigned",
    });
    expect(splitNotificationTitle({ title: 'Completed: "Fix login"' })).toEqual({
      subject: "Fix login",
      event: "Completed",
    });
  });

  test("keeps a trailing event when the subject leads the title", () => {
    expect(
      splitNotificationTitle({ title: '"Fix login" moved to code review' }),
    ).toEqual({ subject: "Fix login", event: "moved to code review" });
  });

  test("strips a preposition stranded by the quoted subject", () => {
    expect(
      splitNotificationTitle({ title: 'New comment on "Fix login"' }),
    ).toEqual({ subject: "Fix login", event: "New comment" });
    expect(
      splitNotificationTitle({ title: 'Ada requested changes on "Fix login"' }),
    ).toEqual({ subject: "Fix login", event: "Ada requested changes" });
  });

  test("splits unquoted run outcomes at the first colon", () => {
    expect(
      splitNotificationTitle({ title: "Quick task completed: Fix login" }),
    ).toEqual({ subject: "Fix login", event: "Quick task completed" });
    expect(splitNotificationTitle({ title: "Task failed: Fix login" })).toEqual({
      subject: "Fix login",
      event: "Task failed",
    });
  });

  test("quotes inside a colon-format subject stay with the subject", () => {
    expect(
      splitNotificationTitle({
        title: 'Quick task completed: Fix the "login" flow',
      }),
    ).toEqual({
      subject: 'Fix the "login" flow',
      event: "Quick task completed",
    });
  });

  test("a colon inside the subject stays with the subject", () => {
    expect(
      splitNotificationTitle({ title: 'New comment on "Parser: rewrite it"' }),
    ).toEqual({ subject: "Parser: rewrite it", event: "New comment" });
    expect(
      splitNotificationTitle({ title: "Task completed: Parser: rewrite it" }),
    ).toEqual({ subject: "Parser: rewrite it", event: "Task completed" });
  });

  test("mentions and replies read as entity over actor", () => {
    expect(
      splitNotificationTitle({
        title: "Ada mentioned you in a comment",
        contextLabel: "Inbox redesign: Fix login",
      }),
    ).toEqual({
      subject: "Inbox redesign: Fix login",
      event: "Ada mentioned you in a comment",
    });
    expect(
      splitNotificationTitle({
        title: "Ada replied to your comment",
        contextLabel: "Fix login",
      }),
    ).toEqual({ subject: "Fix login", event: "Ada replied to your comment" });
  });

  test("an unrecognised title stays whole on line one", () => {
    expect(splitNotificationTitle({ title: "Rate limit reached" })).toEqual({
      subject: "Rate limit reached",
      event: undefined,
    });
  });

  test("a blank context label falls through to parsing the title", () => {
    expect(
      splitNotificationTitle({
        title: '  Assigned: "Fix login"  ',
        contextLabel: "   ",
      }),
    ).toEqual({ subject: "Fix login", event: "Assigned" });
  });
});
