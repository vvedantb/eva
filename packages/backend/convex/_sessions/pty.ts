import { v } from "convex/values";
import type { DatabaseWriter } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { authMutation, getSessionWithAccess } from "../functions";
import type { Id } from "../_generated/dataModel";

/** Patches the PTY session ID on a session, throwing if it does not exist. */
async function applyPtySession(
  db: DatabaseWriter,
  id: Id<"sessions">,
  ptySessionId: string | undefined,
): Promise<null> {
  const session = await db.get(id);
  if (!session) {
    throw new Error("Session not found");
  }
  await db.patch(id, {
    ptySessionId,
    updatedAt: Date.now(),
  });
  return null;
}

/** Updates the PTY session ID on a session (user-facing). */
export const updatePtySession = authMutation({
  args: {
    id: v.id("sessions"),
    ptySessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getSessionWithAccess(ctx.db, args.id, ctx.userId);
    return applyPtySession(ctx.db, args.id, args.ptySessionId);
  },
});

/** Updates the PTY session ID on a session (internal use, no auth check). */
export const updatePtySessionInternal = internalMutation({
  args: {
    id: v.id("sessions"),
    ptySessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: (ctx, args) => applyPtySession(ctx.db, args.id, args.ptySessionId),
});
