import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Live sharing for the `/slides` deck — "follow the presenter" (Teams-style),
 * without take-control. The presenter is the sole driver: only the browser
 * holding the secret `hostKey` (returned once from `createSession`) may move
 * the deck. Viewers are anonymous — they subscribe to `getSession` and either
 * follow `slide` live or detach to browse on their own.
 *
 * Every function is PUBLIC (the `/slides` route is reachable without sign-in).
 * Deliberately lean: no auth, no presence, no names — just a session row,
 * pruned daily.
 */

const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000;
const CODE_LENGTH = 7;

function tallyPollVotes(
  votes: Array<{
    participantKey: string;
    optionId: string;
  }>,
): { counts: Map<string, number>; total: number } {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const key = `${vote.participantKey}\0${vote.optionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  }
  return { counts, total: seen.size };
}

async function getSessionByCode(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<Doc<"presentationSessions"> | null> {
  return await ctx.db
    .query("presentationSessions")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
}

async function patchSession(
  ctx: MutationCtx,
  session: Doc<"presentationSessions">,
  patch: Partial<Pick<Doc<"presentationSessions">, "slide" | "status">>,
): Promise<void> {
  await ctx.db.patch(session._id, { ...patch, lastActiveAt: Date.now() });
}

async function deleteParticipantOptionVotes(
  ctx: MutationCtx,
  args: {
    code: string;
    pollId: string;
    participantKey: string;
    optionId: string;
  },
): Promise<void> {
  const rows = await ctx.db
    .query("presentationVotes")
    .withIndex("by_code_poll_participant_option", (q) =>
      q
        .eq("code", args.code)
        .eq("pollId", args.pollId)
        .eq("participantKey", args.participantKey)
        .eq("optionId", args.optionId),
    )
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

function isNumberLikeCode(code: string): boolean {
  return /^\d+(e\d+)?$/.test(code);
}

async function generateUniqueCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, CODE_LENGTH);
    if (isNumberLikeCode(code)) continue;
    const existing = await getSessionByCode(ctx, code);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique session code");
}

export const createSession = mutation({
  args: { slide: v.number() },
  returns: v.object({ code: v.string(), hostKey: v.string() }),
  handler: async (ctx, args) => {
    const code = await generateUniqueCode(ctx);
    const hostKey = crypto.randomUUID();
    await ctx.db.insert("presentationSessions", {
      code,
      hostKey,
      slide: args.slide,
      status: "live",
      lastActiveAt: Date.now(),
    });
    return { code, hostKey };
  },
});

export const getSession = query({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      slide: v.number(),
      status: v.union(v.literal("live"), v.literal("ended")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (!session) return null;
    return { slide: session.slide, status: session.status };
  },
});

export const setSlide = mutation({
  args: { code: v.string(), hostKey: v.string(), slide: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (
      !session ||
      session.hostKey !== args.hostKey ||
      session.status !== "live"
    ) {
      return null;
    }
    await patchSession(ctx, session, { slide: args.slide });
    return null;
  },
});

export const stopSharing = mutation({
  args: { code: v.string(), hostKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (!session || session.hostKey !== args.hostKey) return null;
    await patchSession(ctx, session, { status: "ended" });
    return null;
  },
});

export const sendVote = mutation({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
    optionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (!session || session.status !== "live") return null;

    const prior = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey),
      )
      .collect();
    for (const vote of prior) {
      await ctx.db.delete(vote._id);
    }
    await ctx.db.insert("presentationVotes", {
      code: args.code,
      pollId: args.pollId,
      participantKey: args.participantKey,
      optionId: args.optionId,
    });
    await patchSession(ctx, session, {});
    return null;
  },
});

export const togglePollOption = mutation({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
    optionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (!session || session.status !== "live") return null;

    const existing = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant_option", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey)
          .eq("optionId", args.optionId),
      )
      .first();
    if (existing) {
      await deleteParticipantOptionVotes(ctx, args);
    } else {
      await ctx.db.insert("presentationVotes", {
        code: args.code,
        pollId: args.pollId,
        participantKey: args.participantKey,
        optionId: args.optionId,
      });
    }
    await patchSession(ctx, session, {});
    return null;
  },
});

export const getMyPollSelections = query({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey),
      )
      .collect();
    const seen = new Set<string>();
    const optionIds: string[] = [];
    for (const vote of votes) {
      if (seen.has(vote.optionId)) continue;
      seen.add(vote.optionId);
      optionIds.push(vote.optionId);
    }
    return optionIds;
  },
});

export const clearPollVotes = mutation({
  args: { code: v.string(), hostKey: v.string(), pollId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await getSessionByCode(ctx, args.code);
    if (
      !session ||
      session.hostKey !== args.hostKey ||
      session.status !== "live"
    ) {
      return null;
    }

    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll", (q) =>
        q.eq("code", args.code).eq("pollId", args.pollId),
      )
      .collect();
    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }
    await patchSession(ctx, session, {});
    return null;
  },
});

export const pollResults = query({
  args: { code: v.string(), pollId: v.string() },
  returns: v.object({
    options: v.array(v.object({ optionId: v.string(), count: v.number() })),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll", (q) =>
        q.eq("code", args.code).eq("pollId", args.pollId),
      )
      .collect();
    const { counts, total } = tallyPollVotes(votes);
    return {
      options: [...counts.entries()].map(([optionId, count]) => ({
        optionId,
        count,
      })),
      total,
    };
  },
});

export const dedupePollVotesInternal = internalMutation({
  args: {},
  returns: v.object({ removed: v.number() }),
  handler: async (ctx) => {
    const votes = await ctx.db.query("presentationVotes").collect();
    const seen = new Set<string>();
    let removed = 0;
    for (const vote of votes) {
      const key = `${vote.code}\0${vote.pollId}\0${vote.participantKey}\0${vote.optionId}`;
      if (seen.has(key)) {
        await ctx.db.delete(vote._id);
        removed += 1;
      } else {
        seen.add(key);
      }
    }
    return { removed };
  },
});

export const pruneStaleInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SESSION_MAX_IDLE_MS;
    const sessions = await ctx.db.query("presentationSessions").collect();
    for (const session of sessions) {
      if (session.status !== "ended" && session.lastActiveAt >= cutoff) {
        continue;
      }
      const votes = await ctx.db
        .query("presentationVotes")
        .withIndex("by_code_poll", (q) => q.eq("code", session.code))
        .collect();
      for (const vote of votes) {
        await ctx.db.delete(vote._id);
      }
      await ctx.db.delete(session._id);
    }
    return null;
  },
});
