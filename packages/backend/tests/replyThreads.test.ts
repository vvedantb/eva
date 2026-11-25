import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";

/**
 * Reply threads (projects v2, PR D): a reply is a row of the same chat with
 * `replyTo` set. It never shows in the transcript, counts into its root, and
 * wakes Eva only when it @mentions her — her answer then joins the thread.
 */

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|reply-threads";
const EVA = "@[Eva](eva_coordinator_mention)";

// Started workflows must not run their steps after the test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Threads",
      status: "active",
      sandboxId: "sbx_threads",
      numId: 1,
    });
    const chatId = await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const rootId = await ctx.db.insert("messages", {
      parentId: chatId,
      role: "assistant",
      content: "I created #904.",
      timestamp: Date.now(),
      finishedAt: Date.now(),
    });
    return { userId, chatId, rootId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

function transcript(
  f: Awaited<ReturnType<typeof fixture>>,
  chatId: Id<"sessionChats">,
) {
  return f.asUser.query(api.messages.listByParent, { parentId: chatId });
}

describe("reply threads", () => {
  test(
    "a reply stays out of the transcript, counts into its root, and wakes no one",
    async () => {
      const f = await fixture();
      const replyId = await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: "Can we rename it?",
        model: "claude:sonnet",
      });

      const rows = await transcript(f, f.chatId);
      expect(rows.map((row) => row._id)).toEqual([f.rootId]);
      expect(rows[0]?.replyCount).toBe(1);
      expect(rows[0]?.replierIds).toEqual([f.userId]);

      const thread = await f.asUser.query(api.messages.listReplies, {
        rootId: f.rootId,
      });
      expect(thread?.replies.map((row) => row._id)).toEqual([replyId]);

      const state = await f.t.run(async (ctx) => ({
        queued: await ctx.db.query("queuedMessages").collect(),
        turns: await ctx.db.query("turns").collect(),
      }));
      expect(state.queued).toHaveLength(0);
      expect(state.turns).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  test(
    "a reply that @mentions Eva opens her turn, and her answer joins the thread",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: `${EVA} can you split it in two?`,
        model: "claude:sonnet",
      });

      const state = await f.t.run(async (ctx) => {
        const turns = await ctx.db.query("turns").collect();
        const placeholder = turns[0]?.placeholderMessageId
          ? await ctx.db.get(turns[0].placeholderMessageId)
          : null;
        return { turns, placeholder };
      });
      expect(state.turns).toHaveLength(1);
      expect(state.placeholder?.replyTo).toBe(f.rootId);

      // Still only the root in the transcript; the thread holds the reply
      // and Eva's answer row.
      const rows = await transcript(f, f.chatId);
      expect(rows.map((row) => row._id)).toEqual([f.rootId]);
      expect(rows[0]?.replyCount).toBe(2);
      const thread = await f.asUser.query(api.messages.listReplies, {
        rootId: f.rootId,
      });
      expect(thread?.replies.map((row) => row.role)).toEqual([
        "user",
        "assistant",
      ]);
    },
    TIMEOUT_MS,
  );
});
