"use node";

import { ConvexError, v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "../_generated/api";
import { authAction } from "../functions";
import { getSandboxHandle } from "./helpers";

type ForkSource = FunctionReturnType<typeof internal.sessions.getForkSource>;

const NO_SANDBOX =
  "This session's sandbox was deleted, so there is nothing to fork.";

const STOP_WAIT_MS = 3 * 60_000;
const POLL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "Fork session": a new session with the source's transcript whose first
 * sandbox is a Vercel fork (`Sandbox.fork`) of the source sandbox, so local DBs
 * (Supabase volume, Convex local backend) and untracked seed files come along.
 *
 * A Vercel fork restores from the source's current snapshot, not its live
 * disk, and stopping is what writes that snapshot — so a running source is
 * stopped first, then started again once the fork exists. A source that was
 * already stopped or archived is left as it was.
 */
export const forkSession = authAction({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ numId: v.number() }),
  handler: async (ctx, args): Promise<{ numId: number }> => {
    let source: ForkSource = await ctx.runQuery(internal.sessions.getForkSource, {
      sessionId: args.sessionId,
    });
    if (!source.sandboxId) throw new ConvexError(NO_SANDBOX);
    if (source.hasOpenTurn) {
      throw new ConvexError("Wait for the current turn to finish, then fork.");
    }
    const wasRunning =
      source.status === "active" || source.status === "starting";
    if (wasRunning) {
      await ctx.runMutation(internal.sessions.requestStopSandbox, {
        sessionId: args.sessionId,
      });
    }
    const deadline = Date.now() + STOP_WAIT_MS;
    while (source.status !== "closed") {
      if (Date.now() > deadline) {
        throw new ConvexError(
          "The session's sandbox is taking too long to stop. Try forking again in a minute.",
        );
      }
      await sleep(POLL_MS);
      source = await ctx.runQuery(internal.sessions.getForkSource, {
        sessionId: args.sessionId,
      });
    }
    const sourceSandboxId = source.sandboxId;
    if (!sourceSandboxId) throw new ConvexError(NO_SANDBOX);
    // The fork itself runs when the new session boots; fail now, not then, if
    // the provider has already dropped the source.
    try {
      await getSandboxHandle(ctx, source.repoId, sourceSandboxId);
    } catch {
      throw new ConvexError(NO_SANDBOX);
    }
    const fork = await ctx.runMutation(internal.sessions.createForkedSession, {
      sourceSessionId: args.sessionId,
      sourceSandboxId,
    });
    if (wasRunning) {
      // Bring the source back the way the Start button does. Safe for the fork:
      // it restores from the snapshot the stop wrote, which a resume leaves
      // untouched. Best-effort — the fork already exists either way.
      try {
        await ctx.runMutation(api.sessions.startSandbox, {
          sessionId: args.sessionId,
        });
      } catch (error) {
        console.warn(
          `[sandbox][fork] source restart failed sessionId=${args.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return fork;
  },
});
