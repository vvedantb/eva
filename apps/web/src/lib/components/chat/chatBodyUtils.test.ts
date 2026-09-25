import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { ActivityStep } from "@eva/ui";
import {
  collectQuestionSteps,
  findHandoffBoundaryIds,
  findStreamingTargetMessage,
  visibleChatMessages,
  chatNeedsOtherUserDirectory,
  otherUserIdsInChat,
  readableSendError,
  sandboxComposerState,
  SANDBOX_CHAT_COPY,
  stripErrorPrefix,
  turnErrorTitle,
  type ChatBodyMessage,
} from "./chatBodyUtils";

type TestMessage = {
  role: "user" | "assistant";
  content: string;
  isSystemAlert?: boolean;
  finishedAt?: number;
  label: string;
};

const user = (label: string, content = "hello"): TestMessage => ({
  role: "user",
  content,
  label,
});
const placeholder = (label: string): TestMessage => ({
  role: "assistant",
  content: "",
  label,
});
const finished = (label: string, content = "done"): TestMessage => ({
  role: "assistant",
  content,
  finishedAt: 1,
  label,
});
const alert = (label: string, content = "Handed off"): TestMessage => ({
  role: "assistant",
  content,
  isSystemAlert: true,
  label,
});

describe("findStreamingTargetMessage", () => {
  test("no unfinished placeholder → undefined", () => {
    expect(
      findStreamingTargetMessage([user("u1"), finished("a1")]),
    ).toBeUndefined();
  });

  test("single placeholder is the target", () => {
    const messages = [user("u1"), placeholder("a1")];
    expect(findStreamingTargetMessage(messages)?.label).toBe("a1");
  });

  test("a queued turn's newer placeholder does not steal a still-streaming older turn", () => {
    // The session-62 incident: a synthetic loop-continuation bubble was still
    // streaming when a queued user message inserted its own placeholder.
    const messages = [
      user("u1"),
      finished("loop-turn"),
      placeholder("synthetic-continuation"),
      user("u2"),
      placeholder("queued-turn"),
    ];
    expect(findStreamingTargetMessage(messages)?.label).toBe(
      "synthetic-continuation",
    );
  });

  test("the newer placeholder takes over once the older turn finalises", () => {
    const messages = [
      user("u1"),
      finished("loop-turn"),
      finished("synthetic-continuation"),
      user("u2"),
      placeholder("queued-turn"),
    ];
    expect(findStreamingTargetMessage(messages)?.label).toBe("queued-turn");
  });

  test("system alerts never match, even between placeholders", () => {
    const messages = [
      user("u1"),
      alert("stopped"),
      alert("reconnected"),
      placeholder("a1"),
    ];
    expect(findStreamingTargetMessage(messages)?.label).toBe("a1");
  });

  test("an unfinished bubble with streamed-in content is not a placeholder", () => {
    const messages = [
      user("u1"),
      { role: "assistant" as const, content: "partial", label: "partial" },
      placeholder("a1"),
    ];
    expect(findStreamingTargetMessage(messages)?.label).toBe("a1");
  });
});

describe("visibleChatMessages", () => {
  test("returns the same array when not hiding", () => {
    const messages = [user("u1"), alert("handoff")];
    expect(visibleChatMessages(messages, false)).toBe(messages);
  });

  test("always drops sandbox start/stop/reconnect alerts", () => {
    const messages = [
      user("u1"),
      alert("started", "Sandbox started"),
      alert("stopped", "Sandbox stopped"),
      alert("reconnected", "Sandbox reconnected"),
      finished("a1"),
    ];
    expect(visibleChatMessages(messages, false).map((m) => m.label)).toEqual([
      "u1",
      "a1",
    ]);
  });

  test("keeps failure alerts when not hiding all", () => {
    const messages = [user("u1"), alert("fail", "Failed to start sandbox")];
    expect(visibleChatMessages(messages, false)).toBe(messages);
  });

  test("drops system alerts when hiding", () => {
    const messages = [user("u1"), alert("handoff"), finished("a1")];
    expect(visibleChatMessages(messages, true).map((m) => m.label)).toEqual([
      "u1",
      "a1",
    ]);
  });

  test("an alerts-only transcript is empty when hiding", () => {
    expect(visibleChatMessages([alert("started")], true)).toEqual([]);
  });
});

describe("findHandoffBoundaryIds", () => {
  // Typing `model` as the doc's union keeps these fixtures pinned to real ids.
  const sent = (_id: string, model?: ChatBodyMessage["model"]) => ({
    _id,
    role: "user" as const,
    ...(model !== undefined ? { model } : {}),
  });
  const reply = (_id: string) => ({ _id, role: "assistant" as const });
  const handoffAlert = (_id: string) => ({
    _id,
    role: "assistant" as const,
    isSystemAlert: true,
  });

  test("marks the provider switch, not model changes inside one provider", () => {
    const boundaries = findHandoffBoundaryIds([
      sent("one", "claude:sonnet"),
      reply("reply-one"),
      sent("two", "claude:opus"),
      reply("reply-two"),
      handoffAlert("alert"),
      sent("three", "codex:gpt-5.6-sol"),
    ]);

    expect([...boundaries]).toEqual(["three"]);
  });

  test("unstamped legacy history followed by a stamped turn marks nothing", () => {
    const boundaries = findHandoffBoundaryIds([
      sent("legacy"),
      reply("legacy-reply"),
      sent("first-stamped", "codex:gpt-5.6-sol"),
    ]);

    expect([...boundaries]).toEqual([]);
  });
});

describe("chatNeedsOtherUserDirectory", () => {
  test("solo chats do not subscribe to the user directory", () => {
    expect(
      chatNeedsOtherUserDirectory(
        [{ role: "user", userId: "me" }, { role: "assistant" }],
        "me",
      ),
    ).toBe(false);
  });

  test("a teammate bubble needs the directory", () => {
    expect(
      chatNeedsOtherUserDirectory(
        [{ role: "user", userId: "them" }, { role: "assistant" }],
        "me",
      ),
    ).toBe(true);
  });

  test("unknown current user never needs the directory", () => {
    expect(
      chatNeedsOtherUserDirectory(
        [{ role: "user", userId: "them" }],
        undefined,
      ),
    ).toBe(false);
  });
});

describe("otherUserIdsInChat", () => {
  test("returns sorted unique teammate ids", () => {
    expect(
      otherUserIdsInChat(
        [
          { role: "user", userId: "me" },
          { role: "user", userId: "zoe" },
          { role: "assistant" },
          { role: "user", userId: "ann" },
          { role: "user", userId: "zoe" },
        ],
        "me",
      ),
    ).toEqual(["ann", "zoe"]);
  });
});

/**
 * The failed-turn notice states the error itself, so the stamp the harness
 * writes in front of the text would be said twice.
 */
describe("stripErrorPrefix", () => {
  test("drops the harness stamp", () => {
    expect(
      stripErrorPrefix(
        "Error: You've hit your session limit · resets 12pm (UTC)",
      ),
    ).toBe("You've hit your session limit · resets 12pm (UTC)");
  });

  test("leaves text that never had one", () => {
    expect(stripErrorPrefix("  Claude usage limit reached  ")).toBe(
      "Claude usage limit reached",
    );
  });

  test("only the leading stamp goes", () => {
    expect(stripErrorPrefix("Error: Error: twice")).toBe("Error: twice");
  });
});

/**
 * Reported bug: "Usage limit reached wrong provider name" (fix 64e95e7e). The
 * notice was hard-coded to "Claude usage limit reached", so a chat running on
 * Cursor or Codex blamed a provider it never used — and the recovery it
 * suggests (switch account, wait for the reset) is per provider, so the user
 * was sent to the wrong account list.
 */
describe("turnErrorTitle", () => {
  const rateLimited = (turnModel?: string, messageModel?: string) =>
    turnErrorTitle({
      errorType: "rate_limit",
      turnModel,
      messageModel,
    });

  test.each([
    ["claude:opus", "Claude usage limit reached"],
    ["cursor:composer-2.5", "Cursor usage limit reached"],
    ["codex:gpt-5.6", "GPT usage limit reached"],
    ["opencode:openai/gpt-5.2", "Opencode usage limit reached"],
  ])("%s reports its own provider", (model, expected) => {
    expect(rateLimited(model)).toBe(expected);
  });

  test("falls back to the assistant row's own stamp", () => {
    // Retry paths render a failure with no user turn above it to read.
    expect(rateLimited(undefined, "cursor:composer-2.5")).toBe(
      "Cursor usage limit reached",
    );
  });

  test("the turn's stamp wins over the row's", () => {
    // The row is stamped when the reply lands; the turn's stamp is what the
    // run was actually sent on, so it is the one that ran out.
    expect(rateLimited("cursor:composer-2.5", "claude:opus")).toBe(
      "Cursor usage limit reached",
    );
  });

  test("an unstamped legacy turn names no provider", () => {
    expect(rateLimited()).toBe("Usage limit reached");
  });

  test("every other failure is still framed as one", () => {
    // Only "rate_limit" used to get a notice, so any other failed turn
    // rendered as markdown and read like Eva answering "Error: …".
    expect(
      turnErrorTitle({
        errorType: "generic",
        turnModel: "claude:opus",
        messageModel: undefined,
      }),
    ).toBe("This turn failed");
  });

  test("a turn that did not fail gets no notice", () => {
    expect(
      turnErrorTitle({
        errorType: undefined,
        turnModel: "claude:opus",
        messageModel: undefined,
      }),
    ).toBeNull();
  });
});

/**
 * A send that throws no longer writes an `Error:` turn into the transcript; it
 * raises a toast with "Restore draft" instead, and this is the toast's body.
 * The three send paths (session, task, project) all read it, so a Convex
 * envelope leaking through would be shown to the user in all three.
 */
describe("readableSendError", () => {
  test("keeps only the thrown message from a Convex server error", () => {
    expect(
      readableSendError(
        "[CONVEX M(sessions:sendMessage)] [Request ID: 7c1a] Server Error\nUncaught Error: Eva is asleep\n    at handler (../convex/sessions.ts:42:9)",
      ),
    ).toBe("Eva is asleep");
  });

  test("leaves a message that was written for the user alone", () => {
    expect(readableSendError("You are offline")).toBe("You are offline");
  });

  test("falls back when the envelope was the whole message", () => {
    expect(
      readableSendError("[CONVEX M(sessions:sendMessage)] Server Error"),
    ).toBe("Something went wrong");
  });
});

/**
 * The transcript card is a record of an answered question. A question still on
 * screen in the composer dock must not also render as a card, and a legacy
 * step written before the options were persisted has nothing to show.
 */
describe("collectQuestionSteps", () => {
  const questions: ActivityStep["questions"] = [
    {
      question: "Which surface owns this?",
      options: [{ label: "Composer" }, { label: "Transcript" }],
    },
  ];

  test("an open question is left to the composer dock", () => {
    const step: ActivityStep = {
      type: "question",
      label: "Asking a question...",
      status: "active",
      questions,
    };
    expect(collectQuestionSteps([step])).toEqual([]);
  });

  test("a complete question with no persisted options is skipped", () => {
    const noQuestions: ActivityStep = {
      type: "question",
      label: "Asked a question",
      status: "complete",
    };
    const emptyQuestions: ActivityStep = {
      type: "question",
      label: "Asked a question",
      status: "complete",
      questions: [],
    };
    expect(collectQuestionSteps([noQuestions, emptyQuestions])).toEqual([]);
  });

  test("keeps only the answered question steps", () => {
    const answered: ActivityStep = {
      type: "question",
      label: "Asked a question",
      status: "complete",
      questions,
      answers: { "Which surface owns this?": "Transcript" },
    };
    const otherStep: ActivityStep = {
      type: "edit",
      label: "Edited file",
      status: "complete",
      path: "/tmp/repo/a.ts",
    };
    expect(collectQuestionSteps([otherStep, answered])).toEqual([answered]);
  });
});

test("ChatBody looks up other senders, not the whole user table", () => {
  const chatBody = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "ChatBody.tsx"),
    "utf8",
  );
  expect(chatBody).toContain("api.users.getMany");
  expect(chatBody).not.toContain("api.users.listAll");
});

/**
 * The bug this covers: quick task chat locked its composer whenever the
 * sandbox was not marked active, and a quick task's first run only marks it
 * active once the run winds down. So the whole time there was something to
 * queue behind, there was no way to type it — while sessions queued fine.
 */
describe("sandboxComposerState", () => {
  test("a running turn takes a follow-up even before the sandbox is active", () => {
    const state = sandboxComposerState({
      isSandboxActive: false,
      isSwitchingAccount: false,
      isExecuting: true,
    });
    expect(state.isInputDisabled).toBe(false);
    expect(state.placeholder).toBe(SANDBOX_CHAT_COPY.activePlaceholder);
  });

  test("an idle chat with no sandbox still says to wake Eva", () => {
    const state = sandboxComposerState({
      isSandboxActive: false,
      isSwitchingAccount: false,
      isExecuting: false,
    });
    expect(state.isInputDisabled).toBe(true);
    expect(state.placeholder).toBe(SANDBOX_CHAT_COPY.asleepPlaceholder);
    expect(state.disabledReason).toBe(SANDBOX_CHAT_COPY.asleepDisabledReason);
  });

  test("an account swap blocks the composer even mid-turn", () => {
    const state = sandboxComposerState({
      isSandboxActive: true,
      isSwitchingAccount: true,
      isExecuting: true,
    });
    expect(state.isInputDisabled).toBe(true);
    expect(state.disabledReason).toBe(
      SANDBOX_CHAT_COPY.switchingAccountPlaceholder,
    );
  });

  test("an awake, idle chat is open for a normal send", () => {
    expect(
      sandboxComposerState({
        isSandboxActive: true,
        isSwitchingAccount: false,
        isExecuting: false,
      }),
    ).toEqual({
      isInputDisabled: false,
      placeholder: SANDBOX_CHAT_COPY.activePlaceholder,
      disabledReason: SANDBOX_CHAT_COPY.asleepDisabledReason,
    });
  });
});
