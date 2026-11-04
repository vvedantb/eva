import type { api, Id } from "@eva/backend";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { openChatTurnOptimistically } from "./useChatTurnOpen";

/**
 * A direct send marks the chat's turn open before the server answers, so a
 * second send in that window queues instead of starting another turn.
 */

const CHAT_ID = z.custom<Id<"agentTasks">>().parse("task_1");

type ChatStatus = FunctionReturnType<typeof api.turns.getChatStatus> | undefined;

/** One-entry store: `getChatStatus` for one chat, recording every write. */
function fakeStore(initial: ChatStatus) {
  const writes: ChatStatus[] = [];
  let value = initial;
  const store: OptimisticLocalStore = {
    getQuery: () => value,
    getAllQueries: () => [],
    setQuery: (_query, _args, next) => {
      value = next;
      writes.push(next);
    },
  };
  return { store, writes };
}

describe("openChatTurnOptimistically", () => {
  test("marks an idle chat's turn open", () => {
    const { store, writes } = fakeStore(null);
    openChatTurnOptimistically(store, CHAT_ID);
    expect(writes).toEqual([{ source: "legacy" }]);
  });

  test("marks a still-loading chat's turn open", () => {
    const { store, writes } = fakeStore(undefined);
    openChatTurnOptimistically(store, CHAT_ID);
    expect(writes).toEqual([{ source: "legacy" }]);
  });

  test("leaves a running turn's real status alone", () => {
    const { store, writes } = fakeStore({
      source: "durable",
      turnId: z.custom<Id<"turns">>().parse("turn_1"),
      state: "running",
      startedAt: 1,
      leaseExpiresAt: 2,
    });
    openChatTurnOptimistically(store, CHAT_ID);
    expect(writes).toEqual([]);
  });
});
