import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  findHandoffBoundaryIds,
  findStreamingTargetMessage,
  visibleChatMessages,
  chatNeedsOtherUserDirectory,
  otherUserIdsInChat,
  stripErrorPrefix,
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
        [
          { role: "user", userId: "me" },
          { role: "assistant" },
        ],
        "me",
      ),
    ).toBe(false);
  });

  test("a teammate bubble needs the directory", () => {
    expect(
      chatNeedsOtherUserDirectory(
        [
          { role: "user", userId: "them" },
          { role: "assistant" },
        ],
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

test("ChatBody looks up other senders, not the whole user table", () => {
  const chatBody = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "ChatBody.tsx"),
    "utf8",
  );
  expect(chatBody).toContain("api.users.getMany");
  expect(chatBody).not.toContain("api.users.listAll");
});
