"use node";

import { ConvexError, v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authAction } from "../functions";
import { isMissingGithubBranchError } from "../_github/deploymentSnapshot";
import { getInstallationOctokit } from "../githubAuth";
import { getSandboxHandle, sleep } from "./helpers";
import { isSandboxGoneError } from "./sandboxErrors";

type ForkSource = FunctionReturnType<typeof internal.sessions.getForkSource>;
type ForkCopyPage = FunctionReturnType<
  typeof internal.sessions.copyForkMessages
>;

const TURN_OPEN = "Wait for the current turn to finish, then fork.";
const NO_SANDBOX =
  "This session's sandbox was deleted, so there is nothing to fork.";

const STOP_WAIT_MS = 3 * 60_000;
const POLL_MS = 2_000;

/**
 * Whether the source branch is on GitHub, which is what makes it a valid PR
 * base for the fork. A missing branch is a normal answer (never pushed, or
 * deleted after its PR merged); any other failure is a real error.
 */
async function branchExistsOnGitHub(
  repo: ForkSource["repo"],
  branch: string,
): Promise<boolean> {
  const octokit = await getInstallationOctokit(repo.installationId);
  try {
    await octokit.rest.repos.getBranch({
      owner: repo.owner,
      repo: repo.name,
      branch,
    });
    return true;
  } catch (error) {
    if (error instanceof Error && isMissingGithubBranchError(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * "Fork session": a new session stacked on the source — its branch is cut
 * from the source branch and its PR targets it — with a copy of the source's
 * transcript, whose first sandbox is a Vercel fork (`Sandbox.fork`) of the
 * source sandbox, so local DBs (Supabase volume, Convex local backend),
 * untracked seed files and the agent's own persisted conversation come along.
 * The transcript is copied here, page by page, before the caller navigates: a
 * message sent into the fork can never land in the middle of the copy.
 *
 * A Vercel fork restores from the source's current snapshot, not its live
 * disk, and stopping is what writes that snapshot — so a running source is
 * stopped first. It is started again only after the fork's sandbox has been
 * taken (`settleForkSource`, from the fork's first boot), or right here if the
 * fork fails before it exists. A source that was already stopped or archived
 * is left as it was.
 */
export const forkSession = authAction({
  args: { sessionId: v.id("sessions") },
  returns: v.object({ numId: v.number() }),
  handler: async (ctx, args): Promise<{ numId: number }> => {
    let source: ForkSource = await ctx.runQuery(internal.sessions.getForkSource, {
      sessionId: args.sessionId,
    });
    if (!source.sandboxId) throw new ConvexError(NO_SANDBOX);
    if (source.hasOpenTurn) throw new ConvexError(TURN_OPEN);
    const wasRunning =
      source.status === "active" || source.status === "starting";
    if (wasRunning) {
      await ctx.runMutation(internal.sessions.requestStopSandbox, {
        sessionId: args.sessionId,
      });
    }
    try {
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
      } catch (error) {
        if (isSandboxGoneError(error)) throw new ConvexError(NO_SANDBOX);
        throw error;
      }
      const stackOnSource =
        source.branchName !== undefined &&
        (await branchExistsOnGitHub(source.repo, source.branchName));
      const fork = await ctx.runMutation(
        internal.sessions.createForkedSession,
        {
          sourceSessionId: args.sessionId,
          sourceSandboxId,
          restartSource: wasRunning,
          stackOnSource,
        },
      );
      const pairs: Array<{ from: Id<"messages">; to: Id<"messages"> }> = [];
      let cursor: string | null = null;
      do {
        const page: ForkCopyPage = await ctx.runMutation(
          internal.sessions.copyForkMessages,
          {
            sourceSessionId: args.sessionId,
            sessionId: fork.sessionId,
            cursor,
          },
        );
        pairs.push(...page.pairs);
        cursor = page.cursor;
      } while (cursor !== null);
      await ctx.runMutation(internal.sessions.copyForkCards, {
        sourceSessionId: args.sessionId,
        sessionId: fork.sessionId,
        pairs,
      });
      return { numId: fork.numId };
    } catch (error) {
      // No fork session exists to restart the source later — do it now.
      if (wasRunning) {
        try {
          await ctx.runMutation(api.sessions.startSandbox, {
            sessionId: args.sessionId,
          });
        } catch (restartError) {
          console.warn(
            `[sandbox][fork] source restart failed sessionId=${args.sessionId}: ${restartError instanceof Error ? restartError.message : String(restartError)}`,
          );
        }
      }
      throw error;
    }
  },
});
