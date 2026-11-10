import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

const POLL_INTERVAL_MS = 250;
/** Below the 10-minute action ceiling. The gate also clears when setup fails. */
const MAX_WAIT_MS = 8 * 60 * 1000;

/**
 * Waits until a new session's sandbox is on the latest base branch with
 * current dependencies (`sandboxSetupPending` cleared). Daemon providers get
 * this from claimPendingTurn; one-shot providers (OpenCode) push their prompt
 * at launch, so without this they ran against the snapshot's stale checkout.
 * Returns the wait in ms. Never throws: on timeout the launch goes ahead.
 */
export const waitForSessionSetup = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      const session = await ctx.runQuery(internal.sessions.getInternal, {
        id: args.sessionId,
      });
      if (session?.sandboxSetupPending !== true) {
        return Date.now() - startedAt;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    console.warn(
      `[sessionWorkflow] waitForSessionSetup timed out after ${MAX_WAIT_MS}ms sessionId=${args.sessionId}; launching anyway`,
    );
    return Date.now() - startedAt;
  },
});
