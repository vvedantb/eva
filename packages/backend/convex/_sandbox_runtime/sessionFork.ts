"use node";

import { ConvexError, v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { authAction } from "../functions";
import { getSandboxHandle, resolveSandboxClientOnly } from "./helpers";

type ForkSource = FunctionReturnType<typeof internal.sessions.getForkSource>;

const STOP_WAIT_MS = 3 * 60_000;
const SNAPSHOT_WAIT_MS = 90_000;
const POLL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The source sandbox's last-stop snapshot, once it is usable. `undefined` when
 * the sandbox (and with it every snapshot) was already deleted — e.g. an
 * archived session past its 48h grace — so the fork falls back to the repo
 * snapshot and only the transcript carries over.
 */
async function resolveForkSnapshot(
  ctx: ActionCtx,
  repoId: Id<"githubRepos">,
  sandboxId: string,
): Promise<string | undefined> {
  let snapshotId: string | undefined;
  try {
    const handle = await getSandboxHandle(ctx, repoId, sandboxId);
    snapshotId = handle.currentSnapshotId;
  } catch (error) {
    console.log(
      `[sandbox][fork] source sandbox unavailable sandboxId=${sandboxId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  if (!snapshotId) return undefined;
  const client = await resolveSandboxClientOnly(ctx, repoId);
  const deadline = Date.now() + SNAPSHOT_WAIT_MS;
  for (;;) {
    const info = await client.getSnapshot(snapshotId);
    if (info?.status === "ready") return snapshotId;
    if (!info || info.status === "error" || Date.now() > deadline) {
      return undefined;
    }
    await sleep(POLL_MS);
  }
}

/**
 * "Fork session": a new session with the source's transcript whose sandbox
 * boots from the source sandbox's disk, so local DBs (Supabase volume, Convex
 * local backend) and untracked seed files come along. A running source is
 * stopped first — stopping is what writes the snapshot — and resumes from it
 * untouched the next time it is opened.
 */
export const forkSession = authAction({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ numId: v.number(), carriedSandbox: v.boolean() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ numId: number; carriedSandbox: boolean }> => {
    let source: ForkSource = await ctx.runQuery(internal.sessions.getForkSource, {
      sessionId: args.sessionId,
    });
    if (source.hasOpenTurn) {
      throw new ConvexError("Wait for the current turn to finish, then fork.");
    }
    let snapshotId: string | undefined;
    if (source.sandboxId) {
      if (source.status === "active" || source.status === "starting") {
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
      if (source.sandboxId) {
        snapshotId = await resolveForkSnapshot(
          ctx,
          source.repoId,
          source.sandboxId,
        );
      }
    }
    const { numId }: { numId: number } = await ctx.runMutation(
      internal.sessions.createForkedSession,
      { sourceSessionId: args.sessionId, snapshotId },
    );
    return { numId, carriedSandbox: snapshotId !== undefined };
  },
});
