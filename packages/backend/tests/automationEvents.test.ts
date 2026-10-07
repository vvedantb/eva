import { describe, expect, test } from "vitest";
import {
  parseRepoEvents,
  repoEventKey,
  triggerMatchesEvent,
  type RepoEvent,
} from "../convex/_automationEvents/events";
import {
  buildCiFailureMessage,
  buildReviewFeedbackMessage,
  MAX_MESSAGE_CHARS,
  tailLog,
} from "../convex/_automationEvents/messages";
import {
  automationCronspec,
  automationTrigger,
} from "../convex/_automations/systemAutomations";
import type { AutomationTrigger } from "../convex/_automationEvents/events";

const repository = { name: "eva", owner: { login: "acme" } };
const human = { type: "User" };

describe("parseRepoEvents", () => {
  test("a failed check suite fans out to one ci_failed event per PR", () => {
    const events = parseRepoEvents(
      "check_suite",
      JSON.stringify({
        action: "completed",
        check_suite: {
          conclusion: "failure",
          head_sha: "abc123",
          pull_requests: [{ number: 7 }, { number: 9 }],
        },
        repository,
      }),
    );
    expect(events).toEqual([
      {
        kind: "ci_failed",
        owner: "acme",
        name: "eva",
        prUrl: "https://github.com/acme/eva/pull/7",
        prNumber: 7,
        headSha: "abc123",
      },
      {
        kind: "ci_failed",
        owner: "acme",
        name: "eva",
        prUrl: "https://github.com/acme/eva/pull/9",
        prNumber: 9,
        headSha: "abc123",
      },
    ]);
  });

  test("a passing check suite is ignored", () => {
    const body = JSON.stringify({
      action: "completed",
      check_suite: {
        conclusion: "success",
        head_sha: "abc",
        pull_requests: [{ number: 1 }],
      },
      repository,
    });
    expect(parseRepoEvents("check_suite", body)).toEqual([]);
  });

  test("review comments from bots and outsiders never reach the agent", () => {
    const comment = (association: string, senderType: string) =>
      JSON.stringify({
        action: "created",
        comment: { author_association: association },
        pull_request: {
          number: 3,
          html_url: "https://github.com/acme/eva/pull/3",
        },
        repository,
        sender: { type: senderType },
      });
    expect(
      parseRepoEvents("pull_request_review_comment", comment("MEMBER", "Bot")),
    ).toEqual([]);
    expect(
      parseRepoEvents(
        "pull_request_review_comment",
        comment("CONTRIBUTOR", "User"),
      ),
    ).toEqual([]);
    expect(
      parseRepoEvents("pull_request_review_comment", comment("MEMBER", "User")),
    ).toHaveLength(1);
  });

  test("a bare approval is not feedback", () => {
    const body = JSON.stringify({
      action: "submitted",
      review: { state: "approved", author_association: "OWNER" },
      pull_request: { number: 3, html_url: "https://github.com/acme/eva/pull/3" },
      repository,
      sender: human,
    });
    expect(parseRepoEvents("pull_request_review", body)).toEqual([]);
  });

  test("issue comments only count on pull requests", () => {
    const body = (pullRequest: object | null) =>
      JSON.stringify({
        action: "created",
        issue: { number: 4, pull_request: pullRequest },
        comment: { author_association: "OWNER" },
        repository,
        sender: human,
      });
    expect(parseRepoEvents("issue_comment", body(null))).toEqual([]);
    expect(
      parseRepoEvents(
        "issue_comment",
        body({ html_url: "https://github.com/acme/eva/pull/4" }),
      ),
    ).toEqual([
      {
        kind: "pr_feedback",
        owner: "acme",
        name: "eva",
        prUrl: "https://github.com/acme/eva/pull/4",
        prNumber: 4,
      },
    ]);
  });

  test("labelling an issue yields issue_labeled with its content", () => {
    const events = parseRepoEvents(
      "issues",
      JSON.stringify({
        action: "labeled",
        label: { name: "eva" },
        issue: {
          number: 12,
          html_url: "https://github.com/acme/eva/issues/12",
          title: "Crash on save",
          body: null,
        },
        repository,
        sender: human,
      }),
    );
    expect(events).toEqual([
      {
        kind: "issue_labeled",
        owner: "acme",
        name: "eva",
        label: "eva",
        issueUrl: "https://github.com/acme/eva/issues/12",
        issueNumber: 12,
        title: "Crash on save",
        body: "",
      },
    ]);
  });

  test("malformed JSON and unknown events are ignored", () => {
    expect(parseRepoEvents("issues", "{not json")).toEqual([]);
    expect(parseRepoEvents("star", "{}")).toEqual([]);
  });
});

describe("triggers", () => {
  const labelled: RepoEvent = {
    kind: "issue_labeled",
    owner: "acme",
    name: "eva",
    label: "Eva",
    issueUrl: "https://github.com/acme/eva/issues/1",
    issueNumber: 1,
    title: "t",
    body: "",
  };

  test("issue triggers match the default label case-insensitively", () => {
    expect(
      triggerMatchesEvent({ kind: "event", event: "issue_labeled" }, labelled),
    ).toBe(true);
    expect(
      triggerMatchesEvent(
        { kind: "event", event: "issue_labeled", label: "eva:web" },
        labelled,
      ),
    ).toBe(false);
    expect(triggerMatchesEvent({ kind: "cron" }, labelled)).toBe(false);
    expect(triggerMatchesEvent(undefined, labelled)).toBe(false);
  });

  test("CI keys are per commit so a new push is a new attempt", () => {
    const failure = (headSha: string): RepoEvent => ({
      kind: "ci_failed",
      owner: "acme",
      name: "eva",
      prUrl: "https://github.com/acme/eva/pull/7",
      prNumber: 7,
      headSha,
    });
    expect(repoEventKey(failure("a"))).not.toBe(repoEventKey(failure("b")));
  });
});

describe("cron registration", () => {
  const row = (overrides: {
    enabled?: boolean;
    systemKey?: string;
    trigger?: AutomationTrigger;
  }) => ({
    cronSchedule: "0 3 * * *",
    enabled: true,
    systemKey: undefined,
    trigger: undefined,
    ...overrides,
  });

  test("only cron-triggered, enabled rows with a schedule get a cron", () => {
    expect(automationCronspec(row({}))).toBe("0 3 * * *");
    expect(automationCronspec(row({ enabled: false }))).toBeNull();
    expect(
      automationCronspec(
        row({ trigger: { kind: "event", event: "pr_merged" } }),
      ),
    ).toBeNull();
  });

  test("event presets keep the install's label but not its event", () => {
    const install = row({
      systemKey: "issue-to-task",
      // A tampered event is ignored: the catalog owns it.
      trigger: { kind: "event", event: "pr_merged", label: "eva:web" },
    });
    expect(automationTrigger(install)).toEqual({
      kind: "event",
      event: "issue_labeled",
      label: "eva:web",
    });
    expect(automationCronspec(install)).toBeNull();
  });
});

describe("messages", () => {
  test("tailLog strips Actions timestamps and colour codes", () => {
    const log = [
      "2026-09-26T10:00:00.1234567Z line one",
      "2026-09-26T10:00:01.0000000Z \u001b[31mError: boom\u001b[0m",
      "",
    ].join("\n");
    expect(tailLog(log, 1)).toBe("Error: boom");
  });

  test("CI message names the attempt and caps its length", () => {
    const message = buildCiFailureMessage({
      prUrl: "https://github.com/acme/eva/pull/7",
      prNumber: 7,
      headSha: "abcdef1234",
      attempt: 2,
      checks: [
        {
          name: "test",
          url: null,
          summary: null,
          logTail: "x".repeat(MAX_MESSAGE_CHARS * 2),
        },
      ],
      instructions: "Fix it.",
    });
    expect(message).toContain("auto-fix attempt 2 of 3");
    expect(message).toContain("`abcdef1`");
    expect(message.length).toBeLessThan(MAX_MESSAGE_CHARS + 50);
  });

  test("review message quotes each comment with its location", () => {
    const message = buildReviewFeedbackMessage({
      prUrl: "https://github.com/acme/eva/pull/3",
      prNumber: 3,
      items: [
        {
          author: "sam",
          body: "Rename this.\nIt is unclear.",
          url: "https://github.com/acme/eva/pull/3#r1",
          path: "src/a.ts",
          line: 10,
        },
      ],
      instructions: "Address it.",
    });
    expect(message).toContain("**@sam** on `src/a.ts:10`");
    expect(message).toContain("> Rename this.\n> It is unclear.");
  });
});
