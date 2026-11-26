import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { errorMessage } from "@vvedantb/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { authMutation, hasRepoAccess } from "./functions";
import { llmJson } from "./_shared/llmJson";
import { buildRootDirectoryInstruction } from "./prompts";
import { buildEvaArenaUrl } from "./_env/webAppUrl";
import { evaluationStatusValidator } from "./validators";
import {
  browserRunJsonSchema,
  buildBrowserRunPrompt,
  scheduleArenaCheckCompletion,
} from "./_arena/browserRun";
import { findReposByOwnerAndName } from "./_githubRepos/helpers";
import { runOneShotAgent } from "./_agentJobs/runOneShotAgent";
import { startAgentJob } from "./_agentJobs/slot";

const scenarioSnapshotValidator = v.object({
  id: v.id("arenaScenarios"),
  title: v.string(),
  instructions: v.string(),
});

/**
 * Runs a doc's browser scenarios against the running app: starts the dev
 * server in an ephemeral sandbox, lets an agent drive agent-browser through
 * each scenario, then stores pass/fail, notes and one screenshot per scenario.
 * PR-triggered runs also report through a GitHub check run.
 */
export const arenaBrowserWorkflow = workflow.define({
  args: {
    reportId: v.id("evaluationReports"),
    docId: v.id("docs"),
    userId: v.id("users"),
    installationId: v.number(),
    branchName: v.optional(v.string()),
  },
  handler: async (step, args): Promise<void> => {
    const saveFailure = async (error: string) => {
      await step.runMutation(internal.evaluationWorkflow.saveWorkflowFailure, {
        reportId: args.reportId,
        error,
      });
    };
    await step.runMutation(internal.evaluationWorkflow.setRunning, {
      reportId: args.reportId,
    });
    let data: FunctionReturnType<typeof internal.arenaBrowserWorkflow.getRunData>;
    try {
      data = await step.runQuery(internal.arenaBrowserWorkflow.getRunData, {
        reportId: args.reportId,
      });
    } catch (error) {
      // A doc with no scenarios left fails the report now, not at the backstop.
      await saveFailure(errorMessage(error));
      return;
    }
    if (data.prNumber !== undefined && data.headSha !== undefined) {
      await step.runAction(internal.arenaActions.createCheckRun, {
        reportId: args.reportId,
      });
    }

    await runOneShotAgent(step, {
      ownerId: args.reportId,
      userId: args.userId,
      installationId: args.installationId,
      repo: { id: data.repoId, owner: data.repoOwner, name: data.repoName },
      sandbox: { kind: "ephemeral", baseBranch: args.branchName },
      agent: { model: "sonnet", allowedTools: "Bash,Read,Glob,Grep" },
      // The prompt names the port the app came up on.
      prompt: async (sandboxId) => {
        const { port } = await step.runAction(
          internal.arenaActions.startAppForRun,
          { sandboxId, repoId: data.repoId },
        );
        return buildBrowserRunPrompt({
          docTitle: data.docTitle,
          docContent: data.docContent,
          scenarios: data.scenarios,
          port,
          rootDirInstruction: data.rootDirInstruction,
        });
      },
      onResult: async (result, sandboxId) => {
        const screenshots = await step.runAction(
          internal.arenaActions.collectScreenshots,
          {
            sandboxId,
            repoId: data.repoId,
            scenarioIds: data.scenarios.map((s) => s.id),
          },
        );
        await step.runMutation(internal.arenaBrowserWorkflow.saveResult, {
          reportId: args.reportId,
          success: result.success,
          result: result.result,
          error: result.error,
          scenarios: data.scenarios,
          screenshots,
        });
      },
      onError: saveFailure,
    });
  },
});

/** Doc, repo and a snapshot of the scenarios as they were when the run started. */
export const getRunData = internalQuery({
  args: { reportId: v.id("evaluationReports") },
  returns: v.object({
    repoId: v.id("githubRepos"),
    repoOwner: v.string(),
    repoName: v.string(),
    docTitle: v.string(),
    docContent: v.string(),
    rootDirInstruction: v.string(),
    scenarios: v.array(scenarioSnapshotValidator),
    prNumber: v.optional(v.number()),
    headSha: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    const doc = await ctx.db.get(report.docId);
    if (!doc) throw new Error("Doc not found");
    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const scenarios = await ctx.db
      .query("arenaScenarios")
      .withIndex("by_doc", (q) => q.eq("docId", doc._id))
      .collect();
    if (scenarios.length === 0) {
      throw new Error("This document has no browser scenarios");
    }

    return {
      repoId: doc.repoId,
      repoOwner: repo.owner,
      repoName: repo.name,
      docTitle: doc.title,
      docContent: doc.content,
      rootDirInstruction: buildRootDirectoryInstruction(
        repo.rootDirectory ?? "",
      ),
      scenarios: scenarios.map((s) => ({
        id: s._id,
        title: s.title,
        instructions: s.instructions,
      })),
      prNumber: report.prNumber,
      headSha: report.headSha,
    };
  },
});

/** Everything the GitHub check run needs, read fresh at create and complete time. */
export const getCheckRunContext = internalQuery({
  args: { reportId: v.id("evaluationReports") },
  returns: v.union(
    v.null(),
    v.object({
      installationId: v.number(),
      owner: v.string(),
      name: v.string(),
      headSha: v.string(),
      checkRunId: v.optional(v.number()),
      docTitle: v.string(),
      detailsUrl: v.string(),
      scenarioCount: v.number(),
      status: evaluationStatusValidator,
      summary: v.optional(v.string()),
      error: v.optional(v.string()),
      scenarioResults: v.array(
        v.object({ title: v.string(), passed: v.boolean(), notes: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report || report.headSha === undefined) return null;
    const doc = await ctx.db.get(report.docId);
    const repo = await ctx.db.get(report.repoId);
    if (!doc || !repo || doc.numId === undefined) return null;
    const scenarios = await ctx.db
      .query("arenaScenarios")
      .withIndex("by_doc", (q) => q.eq("docId", doc._id))
      .collect();

    return {
      installationId: repo.installationId,
      owner: repo.owner,
      name: repo.name,
      headSha: report.headSha,
      checkRunId: report.checkRunId,
      docTitle: doc.title,
      detailsUrl: buildEvaArenaUrl(
        repo.owner,
        repo.name,
        doc.numId,
        "browser",
        repo.rootDirectory,
      ),
      scenarioCount: scenarios.length,
      status: report.status,
      summary: report.summary,
      error: report.error,
      scenarioResults: (report.scenarioResults ?? []).map((r) => ({
        title: r.title,
        passed: r.passed,
        notes: r.notes,
      })),
    };
  },
});

/** Stores the check run GitHub created for a PR-triggered report. */
export const setCheckRunId = internalMutation({
  args: { reportId: v.id("evaluationReports"), checkRunId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, { checkRunId: args.checkRunId });
    return null;
  },
});

/**
 * Maps the agent's JSON onto the scenario snapshot. A scenario the agent did
 * not report on counts as failed, so a short answer can never pass a run.
 */
export const saveResult = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    scenarios: v.array(scenarioSnapshotValidator),
    screenshots: v.array(
      v.object({
        scenarioId: v.id("arenaScenarios"),
        storageId: v.id("_storage"),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    const { json } =
      args.success && args.result
        ? llmJson.extract(args.result)
        : { json: [] };
    if (json.length === 0) {
      await ctx.db.patch(args.reportId, {
        status: "error",
        error: args.error || "Failed to parse browser run results",
        activeWorkflowId: undefined,
        updatedAt: Date.now(),
      });
      await scheduleArenaCheckCompletion(ctx, report);
      return null;
    }

    const parsed = browserRunJsonSchema.parse(json[0]);
    const byId = new Map<string, { passed: boolean; notes: string }>();
    for (const r of parsed.results) {
      if (r) byId.set(r.scenarioId, r);
    }
    const shots = new Map(
      args.screenshots.map((s) => [String(s.scenarioId), s.storageId]),
    );
    const scenarioResults = args.scenarios.map((scenario) => {
      const reported = byId.get(String(scenario.id));
      return {
        scenarioId: scenario.id,
        title: scenario.title,
        passed: reported?.passed ?? false,
        notes: reported?.notes ?? "The agent did not report on this scenario.",
        screenshotStorageId: shots.get(String(scenario.id)),
      };
    });

    await ctx.db.patch(args.reportId, {
      status: "completed",
      scenarioResults,
      summary: parsed.summary,
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
    await scheduleArenaCheckCompletion(ctx, report);
    return null;
  },
});

type StartBrowserRunParams = {
  doc: Doc<"docs">;
  repo: Doc<"githubRepos">;
  userId: Id<"users">;
  branchName: string | undefined;
  pr?: { number: number; headSha: string };
};

/** Inserts a browser report and starts its workflow. Shared by manual and PR runs. */
async function startBrowserRun(
  ctx: MutationCtx,
  params: StartBrowserRunParams,
): Promise<Id<"evaluationReports">> {
  const now = Date.now();
  const reportId = await ctx.db.insert("evaluationReports", {
    repoId: params.repo._id,
    docId: params.doc._id,
    kind: "browser",
    trigger: params.pr ? "pr" : undefined,
    status: "pending",
    branchName: params.branchName,
    prNumber: params.pr?.number,
    headSha: params.pr?.headSha,
    createdAt: now,
    updatedAt: now,
  });

  await startAgentJob(ctx, reportId, () =>
    workflow.start(ctx, internal.arenaBrowserWorkflow.arenaBrowserWorkflow, {
      reportId,
      docId: params.doc._id,
      userId: params.userId,
      installationId: params.repo.installationId,
      branchName: params.branchName,
    }),
  );
  return reportId;
}

async function hasScenarios(
  ctx: MutationCtx,
  docId: Id<"docs">,
): Promise<boolean> {
  const first = await ctx.db
    .query("arenaScenarios")
    .withIndex("by_doc", (q) => q.eq("docId", docId))
    .first();
  return first !== null;
}

/** Manual "Run Test" on the Browser tab. Returns the active run if one exists. */
export const startManualRun = authMutation({
  args: {
    docId: v.id("docs"),
    repoId: v.id("githubRepos"),
    branchName: v.optional(v.string()),
  },
  returns: v.id("evaluationReports"),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.repoId !== args.repoId) {
      throw new Error("Document not found");
    }
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Document not found");
    }
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repository not found");
    if (!(await hasScenarios(ctx, doc._id))) {
      throw new Error("Add a browser scenario before running a test");
    }

    const reports = await ctx.db
      .query("evaluationReports")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    const active = reports.find(
      (r) =>
        r.kind === "browser" &&
        r.trigger === undefined &&
        (r.status === "pending" || r.status === "running"),
    );
    if (active) return active._id;

    return await startBrowserRun(ctx, {
      doc,
      repo,
      userId: ctx.userId,
      branchName: args.branchName,
    });
  },
});

/**
 * Starts a browser run for every doc that opted into PR runs, on the PR's head
 * branch. Called from the GitHub webhook. Skips a commit already tested.
 */
export const startPrRuns = internalMutation({
  args: {
    owner: v.string(),
    name: v.string(),
    prNumber: v.number(),
    headRef: v.string(),
    headSha: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Monorepos have one githubRepos row per app, each with its own docs.
    const repos = await findReposByOwnerAndName(ctx.db, args);

    for (const repo of repos) {
      if (repo.connected === false) continue;
      const docs = await ctx.db
        .query("docs")
        .withIndex("by_repo_and_deleted", (q) =>
          q.eq("repoId", repo._id).eq("deletedAt", undefined),
        )
        .collect();

      for (const doc of docs) {
        const userId = doc.arenaPrRunsUserId;
        if (userId === undefined) continue;
        if (!(await hasRepoAccess(ctx.db, repo._id, userId))) continue;
        if (!(await hasScenarios(ctx, doc._id))) continue;

        const reports = await ctx.db
          .query("evaluationReports")
          .withIndex("by_doc", (q) => q.eq("docId", doc._id))
          .collect();
        if (reports.some((r) => r.headSha === args.headSha)) continue;

        await startBrowserRun(ctx, {
          doc,
          repo,
          userId,
          branchName: args.headRef,
          pr: { number: args.prNumber, headSha: args.headSha },
        });
      }
    }
    return null;
  },
});
