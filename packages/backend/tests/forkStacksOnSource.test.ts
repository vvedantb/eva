import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * `createForkedSession` (fix #882): the fork stacks on the source — its base
 * is the source branch when that branch is on GitHub, else the source's own
 * base — and it never queues the old transcript as a `<forked_thread>` first
 * message, because the forked disk already holds the agent's conversation. The
 * chat rows are not copied either: the fork's Main chat holds one "Forked
 * from" system alert. The Plan tab and interaction mode come along with the
 * source Main chat's composer traits.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|fork-stack";

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const sourceId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "fork-stacks-on-source",
      installationId: 1,
      connectedBy: userId,
      defaultBaseBranch: "main",
    });
    const id = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Seed the invoices table",
      status: "closed",
      numId: 1,
      sandboxId: "sbx_source",
      baseBranch: "develop",
      branchName: "eva/session-source",
      lastModel: "claude:opus",
      planContent: "# Seed plan",
      lastInteractionMode: "plan",
    });
    // Composer picks live on the chat; the session's `lastModel` is stale.
    const mainChatId = await ctx.db.insert("sessionChats", {
      sessionId: id,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
      lastModel: "claude:sonnet",
    });
    await ctx.db.insert("messages", {
      parentId: mainChatId,
      role: "user",
      content: "Seed the invoices table",
      timestamp: 1_000,
      userId,
    });
    await ctx.db.insert("messages", {
      parentId: mainChatId,
      role: "assistant",
      content: "Seeded 12 invoices.",
      timestamp: 2_000,
    });
    return id;
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), sourceId };
}

async function createFork(stackOnSource: boolean) {
  const { t, sourceId } = await fixture();
  const { sessionId } = await t.mutation(
    internal.sessions.createForkedSession,
    {
      sourceSessionId: sourceId,
      sourceSandboxId: "sbx_source",
      restartSource: false,
      stackOnSource,
    },
  );
  return await t.run(async (ctx) => {
    const mainChat = await ctx.db
      .query("sessionChats")
      .withIndex("by_session_and_number", (q) =>
        q.eq("sessionId", sessionId).eq("number", 1),
      )
      .first();
    const chatId = mainChat?._id ?? sessionId;
    return {
      sourceId,
      fork: await ctx.db.get(sessionId),
      mainChat,
      messages: await ctx.db
        .query("messages")
        .withIndex("by_parent", (q) => q.eq("parentId", chatId))
        .collect(),
      queued: await ctx.db
        .query("queuedMessages")
        .withIndex("by_parent_and_created", (q) => q.eq("parentId", chatId))
        .collect(),
    };
  });
}

describe("createForkedSession", () => {
  test(
    "stacks on the source branch and opens with only a Forked from alert",
    async () => {
      const { sourceId, fork, mainChat, messages, queued } =
        await createFork(true);
      expect(mainChat?.lastModel).toBe("claude:sonnet");
      expect(fork).toMatchObject({
        baseBranch: "eva/session-source",
        forkedFromSessionId: sourceId,
        forkSourceSandboxId: "sbx_source",
        planContent: "# Seed plan",
        lastInteractionMode: "plan",
        lastModel: "claude:sonnet",
      });
      expect(fork?.branchName).not.toBe("eva/session-source");
      expect(queued).toEqual([]);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        role: "assistant",
        content: "Forked from session #1 · Seed the invoices table",
        isSystemAlert: true,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "falls back to the source's base when its branch is not on GitHub",
    async () => {
      const { fork, queued } = await createFork(false);
      expect(fork?.baseBranch).toBe("develop");
      expect(queued).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
