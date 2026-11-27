import { v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { getInstallationOctokit } from "../githubAuth";
import { buildEvaAutomationUrl } from "../_env/webAppUrl";
import { runStatusValidator } from "../_validators/enums";
import { resolveAutomationDoc } from "./systemAutomations";

/**
 * The GitHub check run Eva shows on a PR commit while an automation runs for
 * it, like Vercel's deploy check. Only runs started by a PR open, push or
 * merge carry a `headSha`, so only they get one. Best-effort: a missing
 * "Checks: write" permission or a GitHub outage never touches the run.
 */

/** GitHub rejects a check summary over 65,535 characters. */
const MAX_SUMMARY_CHARS = 60_000;

/**
 * Brings the run's check in line with its status. Call after every write that
 * moves a run with a head commit to `running` or a terminal status.
 */
export async function syncCheckRunLater(
  ctx: MutationCtx,
  run: Doc<"automationRuns">,
): Promise<void> {
  if (run.headSha === undefined) return;
  await ctx.scheduler.runAfter(
    0,
    internal._automations.checkRun.syncCheckRun,
    { runId: run._id },
  );
}

const checkRunContextValidator = v.object({
  installationId: v.number(),
  owner: v.string(),
  name: v.string(),
  rootDirectory: v.optional(v.string()),
  headSha: v.string(),
  checkRunId: v.optional(v.number()),
  title: v.string(),
  automationNumId: v.optional(v.number()),
  status: runStatusValidator,
  error: v.optional(v.string()),
  resultSummary: v.optional(v.string()),
  prUrl: v.optional(v.string()),
});

type CheckRunContext = Infer<typeof checkRunContextValidator>;

export const getCheckRunContext = internalQuery({
  args: { runId: v.id("automationRuns") },
  returns: v.union(v.null(), checkRunContextValidator),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    // A queued run has not started yet; its check opens when it does.
    if (!run || run.headSha === undefined || run.status === "queued") {
      return null;
    }
    const stored = await ctx.db.get(run.automationId);
    const repo = await ctx.db.get(run.repoId);
    if (!stored || !repo) return null;
    const automation = resolveAutomationDoc(stored);
    return {
      installationId: repo.installationId,
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory,
      headSha: run.headSha,
      checkRunId: run.checkRunId,
      title: automation.title,
      automationNumId: automation.numId,
      status: run.status,
      error: run.error,
      resultSummary: run.resultSummary,
      prUrl: run.prUrl,
    };
  },
});

export const setCheckRunId = internalMutation({
  args: { runId: v.id("automationRuns"), checkRunId: v.number() },
  returns: v.null(),
  handler: async (ctx, { runId, checkRunId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.checkRunId !== undefined) return null;
    await ctx.db.patch(runId, { checkRunId });
    return null;
  },
});

type CheckRunBody =
  | {
      status: "in_progress";
      output: { title: string; summary: string };
    }
  | {
      status: "completed";
      conclusion: "success" | "neutral" | "cancelled";
      output: { title: string; summary: string };
    };

/**
 * What the check shows for a run status. A failed run is `neutral`, not
 * `failure`: it is usually an Eva or sandbox problem, not one in the PR, so it
 * must not turn the PR red or block a required-check merge.
 */
export function checkRunBody(
  context: Pick<
    CheckRunContext,
    "title" | "status" | "error" | "resultSummary" | "prUrl"
  >,
  detailsUrl: string | undefined,
): CheckRunBody {
  const footer = [
    context.prUrl === undefined ? null : `Pull request: ${context.prUrl}`,
    detailsUrl === undefined ? null : `[Open in Eva](${detailsUrl})`,
  ].filter((line) => line !== null);
  const summary = (text: string) =>
    [text.slice(0, MAX_SUMMARY_CHARS), ...footer].join("\n\n");
  switch (context.status) {
    case "queued":
    case "running":
      return {
        status: "in_progress",
        output: {
          title: "Running",
          summary: summary(`Eva is running **${context.title}** on this commit.`),
        },
      };
    case "success":
      return {
        status: "completed",
        conclusion: "success",
        output: {
          title: "Run finished",
          summary: summary(context.resultSummary ?? "The run finished."),
        },
      };
    case "error":
      return {
        status: "completed",
        conclusion: "neutral",
        output: {
          title: "Run failed",
          summary: summary(
            context.error ?? "The run stopped before it finished.",
          ),
        },
      };
    case "cancelled":
      return {
        status: "completed",
        conclusion: "cancelled",
        output: {
          title: "Run cancelled",
          summary: summary("The run was cancelled in Eva."),
        },
      };
  }
}

/**
 * Creates the run's check on its first sync and updates it after. It reads
 * the run's current status, so a late or repeated sync converges on the truth.
 */
export const syncCheckRun = internalAction({
  args: { runId: v.id("automationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }): Promise<null> => {
    const context = await ctx.runQuery(
      internal._automations.checkRun.getCheckRunContext,
      { runId },
    );
    if (context === null) return null;
    try {
      const detailsUrl =
        context.automationNumId === undefined
          ? undefined
          : buildEvaAutomationUrl(
              context.owner,
              context.name,
              context.automationNumId,
              "run-history",
              context.rootDirectory,
            );
      const body = checkRunBody(context, detailsUrl);
      const octokit = await getInstallationOctokit(context.installationId);
      if (context.checkRunId === undefined) {
        const { data } = await octokit.rest.checks.create({
          owner: context.owner,
          repo: context.name,
          name: `Eva: ${context.title}`,
          head_sha: context.headSha,
          external_id: runId,
          details_url: detailsUrl,
          ...body,
        });
        await ctx.runMutation(internal._automations.checkRun.setCheckRunId, {
          runId,
          checkRunId: data.id,
        });
      } else {
        await octokit.rest.checks.update({
          owner: context.owner,
          repo: context.name,
          check_run_id: context.checkRunId,
          details_url: detailsUrl,
          ...body,
        });
      }
    } catch (error) {
      console.error(
        `[automations] could not sync GitHub check run runId=${runId}`,
        error,
      );
    }
    return null;
  },
});
