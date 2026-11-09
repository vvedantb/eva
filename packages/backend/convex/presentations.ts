import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { presentationStatusValidator } from "./_validators/enums";

/**
 * Live sharing for the `/slides` deck — "follow the presenter" (Teams-style),
 * without take-control. The presenter is the sole driver: only the browser
 * holding the secret `hostKey` (returned once from `createSession`) may move
 * the deck. Viewers are anonymous — they subscribe to `getSession` and either
 * follow `slide` live or detach to browse on their own.
 *
 * Every function is PUBLIC (the `/slides` route is reachable without sign-in).
 * Deliberately lean: no auth, no presence, no names — just a session row.
 */

const CODE_LENGTH = 7;

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
      status: presentationStatusValidator,
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
