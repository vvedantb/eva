import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { DatabaseReader } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  assertMessageParentAccess,
  authMutation,
  authQuery,
} from "../functions";
import { messageFields, sessionProposalFields } from "../validators";
import { latestChatMessageId, resolveChatParent } from "../_chat/chatParent";
import { chatEntityKindValidator } from "../_validators/enums";
import { createSession } from "../_sessions/mutations";

const proposalValidator = v.object({
  _id: v.id("sessionProposals"),
  _creationTime: v.number(),
  ...sessionProposalFields,
});

/** The chat message a "Do it here" click posts back to the agent. */
function doItHereReply(title: string): string {
  return `Do it here, in this chat: ${title}`;
}

/**
 * Stores a pending proposal. Called by the `propose_session` MCP tool, which
 * has already resolved and access-checked the chat, so this stays internal.
 */
export const create = internalMutation({
  args: {
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
    repoId: sessionProposalFields.repoId,
    title: sessionProposalFields.title,
    reason: sessionProposalFields.reason,
    brief: sessionProposalFields.brief,
  },
  returns: v.union(v.id("sessionProposals"), v.null()),
  handler: async (ctx, { entityKind, entityId, ...fields }) => {
    const parentId = await resolveChatParent(ctx.db, entityKind, entityId);
    if (!parentId) return null;
    const messageId = await latestChatMessageId(ctx.db, parentId);
    return await ctx.db.insert("sessionProposals", {
      ...fields,
      parentId,
      ...(messageId ? { messageId } : {}),
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/** Every proposal in one chat, for the transcript to place under its turn. */
export const listByParent = authQuery({
  args: { parentId: messageFields.parentId },
  returns: v.array(proposalValidator),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    return await ctx.db
      .query("sessionProposals")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
  },
});

/** A proposal the caller may answer. Throws when it is gone or answered. */
async function pendingProposal(
  db: DatabaseReader,
  proposalId: Id<"sessionProposals">,
  userId: Id<"users">,
): Promise<Doc<"sessionProposals">> {
  const proposal = await db.get(proposalId);
  if (!proposal) throw new Error("This proposal no longer exists.");
  await assertMessageParentAccess(db, proposal.parentId, userId);
  if (proposal.status !== "pending") {
    throw new Error("This proposal was already answered.");
  }
  return proposal;
}

/** The session a chat belongs to, when the chat is a session's. */
async function owningSessionId(
  db: DatabaseReader,
  parentId: Doc<"sessionProposals">["parentId"],
): Promise<Id<"sessions"> | undefined> {
  const rawId = String(parentId);
  const chatId = db.normalizeId("sessionChats", rawId);
  if (chatId) return (await db.get(chatId))?.sessionId;
  return db.normalizeId("sessions", rawId) ?? undefined;
}

/**
 * "New session": opens a session in the proposing chat's repo on the repo's
 * defaults and queues the agent's brief as its first message. A session's
 * proposal joins that session's linked-session group.
 */
export const start = authMutation({
  args: { proposalId: v.id("sessionProposals") },
  returns: v.object({ sessionId: v.id("sessions"), numId: v.number() }),
  handler: async (ctx, args) => {
    const proposal = await pendingProposal(
      ctx.db,
      args.proposalId,
      ctx.userId,
    );
    const fromSessionId = await owningSessionId(ctx.db, proposal.parentId);
    const created = await createSession(ctx, {
      repoId: proposal.repoId,
      title: proposal.title,
      message: proposal.brief,
      ...(fromSessionId ? { fromSessionId } : {}),
    });
    await ctx.db.patch(proposal._id, {
      status: "started",
      sessionId: created.sessionId,
      sessionNumId: created.numId,
      answeredAt: Date.now(),
    });
    return created;
  },
});

/** "Do it here": returns the message to post to the agent in this chat. */
export const keepHere = authMutation({
  args: { proposalId: v.id("sessionProposals") },
  returns: v.object({ reply: v.string() }),
  handler: async (ctx, args) => {
    const proposal = await pendingProposal(
      ctx.db,
      args.proposalId,
      ctx.userId,
    );
    await ctx.db.patch(proposal._id, {
      status: "here",
      answeredAt: Date.now(),
    });
    return { reply: doItHereReply(proposal.title) };
  },
});
