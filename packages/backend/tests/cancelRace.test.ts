import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import {
  cancelChatTurn,
  detectCancelSupersession,
} from "../convex/_chat/cancelRace";

describe("detectCancelSupersession", () => {
  test("owns the turn when nothing newer staged or tracked", () => {
    expect(
      detectCancelSupersession({
        latestPendingTurn: { requestedAt: 10 },
        cancelPendingRequestedAt: 10,
        latestActiveWorkflowId: "wf-1",
        cancelWorkflowId: "wf-1",
      }),
    ).toEqual({
      newerTurnStaged: false,
      newerWorkflowTracked: false,
      cancelOwnsCurrentTurn: true,
    });
  });

  test("detects a newer staged prompt", () => {
    const result = detectCancelSupersession({
      latestPendingTurn: { requestedAt: 20 },
      cancelPendingRequestedAt: 10,
      latestActiveWorkflowId: "wf-1",
      cancelWorkflowId: "wf-1",
    });
    expect(result.newerTurnStaged).toBe(true);
    expect(result.cancelOwnsCurrentTurn).toBe(false);
  });

  test("detects a different tracked workflow", () => {
    const result = detectCancelSupersession({
      latestActiveWorkflowId: "wf-2",
      cancelWorkflowId: "wf-1",
    });
    expect(result.newerWorkflowTracked).toBe(true);
    expect(result.cancelOwnsCurrentTurn).toBe(false);
  });
});

const modules = import.meta.glob("../convex/**/*.ts");
/** Loading the convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

async function createInFlightSession() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|cancel" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "cancel-chat-turn-test",
      installationId: 1,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Cancel test",
      status: "active",
      pendingTurn: { prompt: "first", requestedAt: 10, model: "claude:sonnet" },
    });
    const messageId = await ctx.db.insert("messages", {
      parentId: sessionId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    });
    await ctx.db.insert("streamingActivity", {
      entityId: String(sessionId),
      currentActivity: "[]",
      currentContent: "partial answer",
    });
    return { sessionId, messageId };
  });
  return { t, ...ids };
}

describe("cancelChatTurn", () => {
  test(
    "an owned cancel keeps the streamed answer and clears streaming",
    async () => {
      const { t, sessionId, messageId } = await createInFlightSession();
      await t.run(async (ctx) => {
        const session = await ctx.db.get(sessionId);
        if (!session) throw new Error("fixture missing");
        const result = await cancelChatTurn(ctx, {
          id: sessionId,
          entity: session,
          activeWorkflowId: (s) => s.activeWorkflowId,
          streamingEntityId: String(sessionId),
          interrupt: async () => {},
          getLatest: () => ctx.db.get(sessionId),
        });
        expect(result?.cancelOwnsCurrentTurn).toBe(true);
        expect(result?.clearsPendingTurn).toBe(true);
        const message = await ctx.db.get(messageId);
        expect(message?.content).toBe("partial answer");
        expect(message?.finishedAt).toBeDefined();
        const streaming = await ctx.db
          .query("streamingActivity")
          .withIndex("by_entity", (q) => q.eq("entityId", String(sessionId)))
          .collect();
        expect(streaming).toHaveLength(0);
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a newer staged turn leaves the placeholder and pendingTurn alone",
    async () => {
      const { t, sessionId, messageId } = await createInFlightSession();
      await t.run(async (ctx) => {
        const session = await ctx.db.get(sessionId);
        if (!session) throw new Error("fixture missing");
        const result = await cancelChatTurn(ctx, {
          id: sessionId,
          entity: session,
          activeWorkflowId: (s) => s.activeWorkflowId,
          streamingEntityId: String(sessionId),
          // A concurrent startExecute stages a newer prompt mid-cancel.
          interrupt: async () => {
            await ctx.db.patch(sessionId, {
              pendingTurn: {
                prompt: "second",
                requestedAt: 20,
                model: "claude:sonnet",
              },
            });
          },
          getLatest: () => ctx.db.get(sessionId),
        });
        expect(result?.cancelOwnsCurrentTurn).toBe(false);
        expect(result?.clearsPendingTurn).toBe(false);
        expect(result?.latest.pendingTurn?.requestedAt).toBe(20);
        const message = await ctx.db.get(messageId);
        expect(message?.finishedAt).toBeUndefined();
      });
    },
    TIMEOUT_MS,
  );
});
