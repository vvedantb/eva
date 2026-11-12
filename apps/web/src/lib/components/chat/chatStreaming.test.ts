import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import { chatStreamingEntityId, findStreamingTargetMessage } from "@eva/shared";
import { parseActivityLog } from "@eva/shared/activityTrace";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { sandboxChatKeys } from "./sandboxChatTurn";

// The live turn as the web and the mobile chat both read it: the same row,
// the same bubble, the same steps.

describe("chatStreamingEntityId", () => {
  test("is the key the web sandbox chat subscribes with", () => {
    const sessionId = z.custom<Id<"sessions">>().parse("session_1");
    const chatId = z.custom<Id<"sessionChats">>().parse("chat_1");
    expect(chatStreamingEntityId(chatId)).toBe(
      sandboxChatKeys({ kind: "session", sessionId, chatId }).streamingEntityId,
    );
    expect(chatStreamingEntityId(chatId)).toBe("chat_1");
  });
});

describe("findStreamingTargetMessage on a transcript row shape", () => {
  const row = (
    _id: string,
    role: "user" | "assistant",
    content: string,
    finishedAt?: number,
  ) => ({ _id, role, content, finishedAt, timestamp: 1 });

  test("returns the row itself, so the caller keys the live bubble by its id", () => {
    const messages = [
      row("u1", "user", "hi"),
      row("a1", "assistant", "done", 2),
      row("a2", "assistant", ""),
    ];
    expect(findStreamingTargetMessage(messages)).toBe(messages[2]);
  });

  test("a turn that has settled leaves no live bubble", () => {
    const messages = [row("u1", "user", "hi"), row("a1", "assistant", "", 2)];
    expect(findStreamingTargetMessage(messages)).toBeUndefined();
  });
});

describe("a streaming activity payload", () => {
  const payload = JSON.stringify([
    { type: "thinking", label: "Thinking...", status: "complete" },
    {
      type: "read",
      label: "Read",
      status: "complete",
      path: "src/app.ts",
      durationMs: 1200,
    },
    {
      type: "bash",
      label: "Running pnpm test",
      status: "active",
      detail: "pnpm test",
      toolUseId: "tool_2",
    },
    { type: "response", label: "Response", status: "active" },
  ]);

  test("reads as the same steps on the phone and the web", () => {
    const phone = parseActivityLog(payload);
    const web = parseActivitySteps(payload) ?? [];
    expect(phone.map((step) => [step.type, step.label, step.status])).toEqual(
      web.map((step) => [step.type, step.label, step.status]),
    );
    expect(phone.find((step) => step.status === "active")?.label).toBe(
      "Running pnpm test",
    );
  });

  test("no payload yet, or an empty one, has no steps", () => {
    expect(parseActivityLog(undefined)).toEqual([]);
    expect(parseActivityLog("[]")).toEqual([]);
    expect(parseActivitySteps(undefined)).toBeNull();
    expect(parseActivitySteps("[]")).toBeNull();
  });
});
