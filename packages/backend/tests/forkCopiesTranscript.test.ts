import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * "Fork session" copies the source transcript row by row instead of replaying
 * it as a `<forked_thread>` prompt: the forked disk already holds the agent's
 * persisted conversation, so the chat must match what the agent remembers.
 * `copyForkMessages` pages through the source in order; `copyForkCards` then
 * re-anchors plan cards and `render_ui` panels on the copies.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|fork" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "fork-copies-transcript",
      installationId: 1,
      connectedBy: userId,
    });
    const sourceId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Seed the invoices table",
      status: "closed",
      numId: 1,
      sandboxId: "sbx_source",
      branchName: "eva/session-source",
    });
    const forkId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Fork · Seed the invoices table",
      status: "starting",
      numId: 2,
      forkedFromSessionId: sourceId,
      forkSourceSandboxId: "sbx_source",
    });
    const attachment = await ctx.storage.store(new Blob(["invoices.csv"]));
    const messageIds: Id<"messages">[] = [];
    messageIds.push(
      await ctx.db.insert("messages", {
        parentId: sourceId,
        role: "user",
        content: "Seed the invoices table",
        timestamp: 1_000,
        userId,
        clientId: "client-1",
        attachmentStorageIds: [attachment],
      }),
    );
    messageIds.push(
      await ctx.db.insert("messages", {
        parentId: sourceId,
        role: "assistant",
        content: "Seeded 12 invoices.",
        timestamp: 2_000,
        finishedAt: 2_500,
        model: "claude:opus",
        activityLog: "Ran the seed script",
        afterSha: "abc123",
        pendingQuestion: "Ship it?",
      }),
    );
    messageIds.push(
      await ctx.db.insert("messages", {
        parentId: sourceId,
        role: "assistant",
        content: "Sandbox stopped",
        timestamp: 3_000,
        isSystemAlert: true,
      }),
    );
    const planId = await ctx.db.insert("proposedPlans", {
      sessionId: sourceId,
      messageId: messageIds[1],
      planMarkdown: "# Seed plan",
      captureKey: "plan:seed",
      implementedAt: 2_400,
      implementationSessionId: sourceId,
      createdAt: 2_100,
      updatedAt: 2_400,
    });
    const panelId = await ctx.db.insert("chatUiPanels", {
      parentId: sourceId,
      messageId: messageIds[1],
      prompt: "metric row",
      spec: "{}",
      elementCount: 1,
      createdAt: 2_200,
    });
    return { sourceId, forkId, messageIds, planId, panelId };
  });
  return { t, ...ids };
}

async function copyAll(f: Awaited<ReturnType<typeof fixture>>, numItems: number) {
  const pairs: Array<{ from: Id<"messages">; to: Id<"messages"> }> = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await f.t.mutation(internal.sessions.copyForkMessages, {
      sourceSessionId: f.sourceId,
      sessionId: f.forkId,
      cursor,
      numItems,
    });
    pairs.push(...page.pairs);
    cursor = page.cursor;
    pages += 1;
  } while (cursor !== null);
  await f.t.mutation(internal.sessions.copyForkCards, {
    sourceSessionId: f.sourceId,
    sessionId: f.forkId,
    pairs,
  });
  return { pairs, pages };
}

describe("fork session transcript copy", () => {
  test(
    "copies every message in order across pages, minus live-state fields",
    async () => {
      const f = await fixture();
      const { pairs, pages } = await copyAll(f, 2);
      expect(pages).toBe(2);
      expect(pairs.map((pair) => pair.from)).toEqual(f.messageIds);

      const { source, fork, queued } = await f.t.run(async (ctx) => ({
        source: await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.sourceId))
          .collect(),
        fork: await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.forkId))
          .collect(),
        queued: await ctx.db
          .query("queuedMessages")
          .withIndex("by_parent_and_created", (q) =>
            q.eq("parentId", f.forkId),
          )
          .collect(),
      }));
      expect(queued).toEqual([]);
      expect(fork.map((row) => row._id)).toEqual(pairs.map((pair) => pair.to));
      expect(fork.map((row) => row.content)).toEqual(
        source.map((row) => row.content),
      );
      for (const [index, copy] of fork.entries()) {
        const original = source[index];
        expect(copy.role).toBe(original?.role);
        expect(copy.timestamp).toBe(original?.timestamp);
        expect(copy.finishedAt).toBe(original?.finishedAt);
        expect(copy.model).toBe(original?.model);
        expect(copy.activityLog).toBe(original?.activityLog);
        expect(copy.afterSha).toBe(original?.afterSha);
        expect(copy.isSystemAlert).toBe(original?.isSystemAlert);
        expect(copy.attachmentStorageIds).toEqual(
          original?.attachmentStorageIds,
        );
        expect(copy.clientId).toBeUndefined();
        expect(copy.pendingQuestion).toBeUndefined();
      }
      expect(fork.every((row) => row.parentId === f.forkId)).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "re-anchors plan cards and panels on the copied messages",
    async () => {
      const f = await fixture();
      const { pairs } = await copyAll(f, 40);
      const assistantCopy = pairs[1]?.to;

      const { plans, panels } = await f.t.run(async (ctx) => ({
        plans: await ctx.db
          .query("proposedPlans")
          .withIndex("by_session", (q) => q.eq("sessionId", f.forkId))
          .collect(),
        panels: await ctx.db
          .query("chatUiPanels")
          .withIndex("by_parent", (q) => q.eq("parentId", f.forkId))
          .collect(),
      }));
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({
        messageId: assistantCopy,
        planMarkdown: "# Seed plan",
        captureKey: "plan:seed",
        implementedAt: 2_400,
      });
      expect(plans[0]?.implementationSessionId).toBeUndefined();
      expect(plans[0]?.turnId).toBeUndefined();
      expect(panels).toHaveLength(1);
      expect(panels[0]).toMatchObject({
        messageId: assistantCopy,
        prompt: "metric row",
        elementCount: 1,
      });
    },
    TIMEOUT_MS,
  );
});
