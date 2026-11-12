import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import {
  sandboxChatKeys,
  sendSandboxTurn,
  type SandboxTurnAddArgs,
  type SandboxTurnEnqueueArgs,
  type SandboxTurnPorts,
  type SandboxTurnSettings,
  type SandboxTurnStartArgs,
} from "./sandboxChatTurn";

type Call =
  | { port: "add"; args: SandboxTurnAddArgs }
  | { port: "start"; args: SandboxTurnStartArgs }
  | { port: "enqueue"; args: SandboxTurnEnqueueArgs };

/** Ports that record each call and settle only when the test says so. */
function deferredPorts() {
  const calls: Call[] = [];
  const settles: Array<(error?: Error) => void> = [];
  const pending = () =>
    new Promise<null>((resolve, reject) => {
      settles.push((error) => (error ? reject(error) : resolve(null)));
    });
  const ports: SandboxTurnPorts = {
    add: (args) => {
      calls.push({ port: "add", args });
      return pending();
    },
    start: (args) => {
      calls.push({ port: "start", args });
      return pending();
    },
    enqueue: (args) => {
      calls.push({ port: "enqueue", args });
      return pending();
    },
  };
  const settleAll = (error?: Error) => {
    for (const settle of settles) settle(error);
  };
  return { ports, calls, settleAll };
}

const ACCOUNT = z.custom<Id<"userProviderAccounts">>().parse("account_1");

const SETTINGS: SandboxTurnSettings = {
  model: "claude:opus",
  effortLevel: undefined,
  executionTraits: { reasoningLevel: "high", fastMode: true },
  providerAccountId: ACCOUNT,
};

describe("sendSandboxTurn", () => {
  test("queue mode only enqueues, falling back to the execution effort", async () => {
    const { ports, calls, settleAll } = deferredPorts();
    const sent = sendSandboxTurn(
      ports,
      SETTINGS,
      { message: "full prompt", displayContent: "short" },
      "queue",
    );
    settleAll();
    await sent;
    expect(calls).toEqual([
      {
        port: "enqueue",
        args: {
          message: "full prompt",
          displayContent: "short",
          model: "claude:opus",
          reasoningLevel: "high",
          fastMode: true,
          providerAccountId: ACCOUNT,
          attachmentStorageIds: undefined,
        },
      },
    ]);
  });

  test("start mode fires add and start together, before either settles", async () => {
    const { ports, calls, settleAll } = deferredPorts();
    const sent = sendSandboxTurn(
      ports,
      { ...SETTINGS, effortLevel: "low" },
      { message: "hello" },
      "start",
    );
    // Both are in flight at once: the optimistic turn-open must apply before
    // the user row round-trips.
    expect(calls.map((call) => call.port)).toEqual(["add", "start"]);
    settleAll();
    await sent;
    expect(calls[0]?.args).toMatchObject({
      content: "hello",
      reasoningLevel: "low",
    });
    // The picker's effort wins over the execution payload on both rows.
    expect(calls[1]?.args).toMatchObject({
      message: "hello",
      reasoningLevel: "low",
    });
  });

  test("the chat row shows the display text; the agent gets the full prompt", async () => {
    const { ports, calls, settleAll } = deferredPorts();
    const sent = sendSandboxTurn(
      ports,
      SETTINGS,
      { message: "rich prompt", displayContent: "compact" },
      "start",
    );
    settleAll();
    await sent;
    expect(calls[0]?.args).toMatchObject({ content: "compact" });
    expect(calls[1]?.args).toMatchObject({ message: "rich prompt" });
  });

  test("a server rejection propagates so the caller keeps its chips", async () => {
    const { ports, settleAll } = deferredPorts();
    const sent = sendSandboxTurn(ports, SETTINGS, { message: "x" }, "start");
    settleAll(new Error("rate limited"));
    await expect(sent).rejects.toThrow("rate limited");
  });
});

describe("sandboxChatKeys", () => {
  test("a chat not created yet has nothing to read or persist", () => {
    expect(sandboxChatKeys(undefined)).toEqual({
      parentId: undefined,
      streamingEntityId: undefined,
      draftTarget: undefined,
    });
  });

  test("a quick task's session chat is addressed by the chat, not the session", () => {
    const sessionId = z.custom<Id<"sessions">>().parse("session_1");
    const chatId = z.custom<Id<"sessionChats">>().parse("chat_1");
    // The stream id must match the backend's `sessionChatStreamingEntityId`.
    expect(sandboxChatKeys({ kind: "session", sessionId, chatId })).toEqual({
      parentId: chatId,
      streamingEntityId: "chat_1",
      draftTarget: { kind: "sessionChat", sessionId, chatId },
    });
  });
});
