import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import {
  EVA_MENTION_ID,
  mentionsEva,
  threadAnswerContent,
  threadPendingQuestion,
  threadRootPreview,
  threadTurnStatusText,
} from "@eva/shared";
import { modules } from "./_helpers/convexModules";

const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|reply-threads";
const EVA = `@[Eva](${EVA_MENTION_ID})`;

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

  test(
    "a thread turn's alerts and retry bubble stay in the thread",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: `${EVA} can you split it in two?`,
        model: "claude:sonnet",
      });
      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: "Thanks!",
        model: "claude:sonnet",
      });
      await f.t.mutation(internal.sessionWorkflow.addAssistantPlaceholder, {
        chatId: f.chatId,
      });
      await f.t.mutation(internal.sessionWorkflow.postSystemAlert, {
        chatId: f.chatId,
        content: "Failed to create draft PR",
      });

      const turn = await f.t.run(async (ctx) =>
        ctx.db.query("turns").first(),
      );
      expect(turn?.replyTo).toBe(f.rootId);
      const rows = await transcript(f, f.chatId);
      expect(rows.map((row) => row._id)).toEqual([f.rootId]);
      const thread = await f.asUser.query(api.messages.listReplies, {
        rootId: f.rootId,
      });
      expect(
        thread?.replies.map((row) => [row.role, row.isSystemAlert ?? false]),
      ).toEqual([
        ["user", false],
        ["assistant", false],
        ["user", false],
        ["assistant", true],
      ]);
      expect(rows[0]?.replyCount).toBe(4);

      const { sessionId } = await f.t.run(async (ctx) => {
        const chat = await ctx.db.get(f.chatId);
        if (!chat) throw new Error("chat missing");
        return { sessionId: chat.sessionId };
      });
      await f.t.mutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId,
        content: "Failed to prepare linked repo",
      });
      expect(await transcript(f, f.chatId)).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  test(
    "a queued thread reply stays out of the chat's queue panel",
    async () => {
      const f = await fixture();
      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: `${EVA} first`,
        model: "claude:sonnet",
      });
      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: `${EVA} second`,
        model: "claude:sonnet",
      });

      const queued = await f.t.run(async (ctx) =>
        ctx.db.query("queuedMessages").collect(),
      );
      expect(queued.map((row) => row.replyTo)).toEqual([f.rootId]);
      const panel = await f.asUser.query(api.queuedMessages.listByParent, {
        parentId: f.chatId,
      });
      expect(panel).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  test(
    "the chat knows when Eva's open turn answers in a thread",
    async () => {
      const f = await fixture();
      const openThreadTurn = () =>
        f.asUser.query(api.messages.openThreadTurn, { parentId: f.chatId });
      expect(await openThreadTurn()).toBeNull();

      await f.asUser.mutation(api.sessionWorkflow.addReply, {
        rootId: f.rootId,
        content: `${EVA} can you split it in two?`,
        model: "claude:sonnet",
      });
      expect(await openThreadTurn()).toEqual({
        rootId: f.rootId,
        preview: "I created #904.",
        hasQuestion: false,
      });

      await f.t.run(async (ctx) => {
        await ctx.db.insert("pendingQuestions", {
          entityId: String(f.chatId),
          toolUseId: "tool_1",
          payload: "[]",
          createdAt: Date.now(),
        });
      });
      expect((await openThreadTurn())?.hasQuestion).toBe(true);

      await f.t.run(async (ctx) => {
        const turn = await ctx.db.query("turns").first();
        if (turn) await ctx.db.patch(turn._id, { open: false });
      });
      expect(await openThreadTurn()).toBeNull();
    },
    TIMEOUT_MS,
  );
});

describe("threadRootPreview", () => {
  test("keeps the first six words as plain text", () => {
    expect(
      threadRootPreview(
        `## Plan\n**Split** \`#904\` for @[Eva](${EVA_MENTION_ID}) into two smaller tasks today`,
      ),
    ).toBe("Plan Split #904 for @Eva into…");
    expect(threadRootPreview("Short one")).toBe("Short one");
  });
});

describe("thread questions", () => {
  const ask = JSON.stringify([{ question: "Which?" }]);

  test("the status line names a question", () => {
    expect(threadTurnStatusText(false)).toBe("Eva is replying in a thread on");
    expect(threadTurnStatusText(true)).toBe("Eva has a question in a thread on");
  });

  test("a thread shows its own turn's streamed question, not the chat's", () => {
    const replies = [{ role: "user" }, { role: "assistant" }];
    expect(
      threadPendingQuestion({ isTurnThread: true, streamingQuestion: ask, replies }),
    ).toBe(ask);
    expect(
      threadPendingQuestion({ isTurnThread: false, streamingQuestion: ask, replies }),
    ).toBeUndefined();
  });

  test("a question saved on the thread's last reply stays to answer", () => {
    expect(
      threadPendingQuestion({
        isTurnThread: false,
        streamingQuestion: undefined,
        replies: [{ role: "user" }, { role: "assistant", pendingQuestion: ask }],
      }),
    ).toBe(ask);
    expect(
      threadPendingQuestion({
        isTurnThread: false,
        streamingQuestion: undefined,
        replies: [{ role: "assistant", pendingQuestion: ask }, { role: "user" }],
      }),
    ).toBeUndefined();
  });

  test("an answer in a thread wakes Eva", () => {
    expect(mentionsEva(threadAnswerContent("The first one"))).toBe(true);
  });
});
