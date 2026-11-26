import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { Id } from "@eva/backend";
import {
  sandboxChatKeys,
  sendSandboxTurn,
  type SandboxTurnExpectation,
  type SandboxTurnPorts,
  type SandboxTurnSendArgs,
  type SandboxTurnSettings,
} from "./sandboxChatTurn";

type Call = { args: SandboxTurnSendArgs; expected: SandboxTurnExpectation };

/** Ports that record each send and settle only when the test says so. */
function deferredPorts() {
  const calls: Call[] = [];
  const settles: Array<(error?: Error) => void> = [];
  const ports: SandboxTurnPorts = {
    send: (args, expected) => {
      calls.push({ args, expected });
      return new Promise<null>((resolve, reject) => {
        settles.push((error) => (error ? reject(error) : resolve(null)));
      });
    },
    postError: () => Promise.resolve(null),
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
  test("one send carries the prompt, display text and composer picks", async () => {
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
        expected: "queue",
        args: {
          message: "full prompt",
          displayContent: "short",
          annotation: undefined,
          attachmentStorageIds: undefined,
          sourceProposedPlanId: undefined,
          // No picker effort: the execution effort is the fallback.
          settings: {
            model: "claude:opus",
            reasoningLevel: "high",
            fastMode: true,
            providerAccountId: ACCOUNT,
          },
        },
      },
    ]);
  });

  test("the picker's effort wins over the execution payload", async () => {
    const { ports, calls, settleAll } = deferredPorts();
    const sent = sendSandboxTurn(
      ports,
      { ...SETTINGS, effortLevel: "low" },
      { message: "hello" },
      "start",
    );
    settleAll();
    await sent;
    expect(calls[0]).toMatchObject({
      expected: "start",
      args: { message: "hello", settings: { reasoningLevel: "low" } },
    });
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
