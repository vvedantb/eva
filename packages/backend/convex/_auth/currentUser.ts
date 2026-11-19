import { createClerkUserAuth } from "@vvedantb/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { DataModel, Id } from "../_generated/dataModel";

/**
 * Clerk-user helpers for the `users` table: the caller's identity `subject`
 * resolved to a row through `by_clerk_id`. From `@vvedantb/server`, the same
 * helper verve, vibot and vmem use.
 *
 * Lives in its own leaf module (not auth.ts) on purpose: auth.ts builds its
 * queries with authQuery/authMutation from functions.ts, so functions.ts
 * importing this helper from auth.ts formed a module cycle. The isolate
 * bundle tolerated it, but the "use node" action bundle evaluated auth.ts
 * first and crashed Convex's deploy analysis with "d is not a function"
 * (authQuery still uninitialized).
 */
export const userAuth = createClerkUserAuth<DataModel>()({
  table: "users",
  index: "by_clerk_id",
  field: "clerkId",
});

/** Resolves the signed-in user's row id from the Clerk identity, or null. */
export async function getCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return userAuth.getCurrentUserId(ctx);
}

/** Resolves the signed-in user's row id, throwing if not authenticated. */
export async function requireCurrentUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  return userAuth.requireCurrentUserId(ctx);
}
