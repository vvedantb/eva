import { v } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "./workflowManager";
import { authMutation, hasRepoAccess } from "./functions";
import { rejectSandboxCaller, requireSandboxCaller } from "./_auth/sandboxIdentity";
import { turnCheckpointArgs, workflowCompleteValidator } from "./validators";
import { trackEvaluationWorkflow } from "./workflowWatchdog";
import {
  clearStreamingActivity,
  llmJson,
  recordCompletionLog,
  sendCompletionEvent,
} from "./_taskWorkflow/helpers";
import { buildPrBody } from "./prBody";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

const evalCompleteEvent = defineEvent({
  name: "evalComplete",
  validator: workflowCompleteValidator,
});

const fixCompleteEvent = defineEvent({
  name: "fixComplete",
  validator: v.object({
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
  }),
});

// --- Workflow definition ---

/** Runs an evaluation: analyzes the codebase against the document and saves a severity-ranked issue list. Fixing issues is opt-in via startFix. */
export const evaluationWorkflow = workflow.define({
  args: {
    reportId: v.id("evaluationReports"),
    docId: v.id("docs"),
    userId: v.id("users"),
    installationId: v.number(),
    branchName: v.optional(v.string()),
  },
  handler: async (step, args): Promise<void> => {
    // Both live outside the try so the finally can tear the sandbox down even
    // when prepare throws part-way through.
    let sandboxId: string | undefined;
    let sandboxRepoId: Id<"githubRepos"> | undefined;
    try {
      await step.runMutation(internal.evaluationWorkflow.setRunning, {
        reportId: args.reportId,
      });

      const docData = await step.runQuery(
        internal.evaluationWorkflow.getDocData,
        { docId: args.docId },
      );
      sandboxRepoId = docData.repoId;

      const streamingEntityId = String(args.reportId);

      ({ sandboxId } = await prepareSandboxSteps(step, {
        installationId: args.installationId,
        repoOwner: docData.repoOwner,
        repoName: docData.repoName,
        ephemeral: true,
        repoId: docData.repoId,
        streamingEntityId,
        baseBranch: args.branchName,
      }));

      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId,
        entityId: String(args.reportId),
        prompt: docData.prompt,
        userId: args.userId,
        completionMutation: "evaluationWorkflow:handleCompletion",
        entityIdField: "reportId",
        model: "sonnet",
        allowedTools: "Read,Glob,Grep",
        repoId: docData.repoId,
      });

      const result = await step.awaitEvent(evalCompleteEvent);

      await step.runMutation(internal.evaluationWorkflow.saveResult, {
        reportId: args.reportId,
        success: result.success,
        result: result.result,
        error: result.error,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Evaluation workflow failed";
      await step.runMutation(internal.evaluationWorkflow.saveWorkflowFailure, {
        reportId: args.reportId,
        error: errorMessage,
      });
      throw error;
    } finally {
      // The sandbox is ephemeral: nothing references it once the report is
      // saved, so it has to be deleted here or it idles until the provider
      // reaps it. Best-effort — a failed delete must not fail the workflow.
      if (sandboxId && sandboxRepoId) {
        try {
          await step.runAction(internal.sandbox.deleteSandbox, {
            sandboxId,
            repoId: sandboxRepoId,
          });
        } catch (cleanupError) {
          console.error("Failed to cleanup evaluation sandbox:", cleanupError);
        }
      }
    }
  },
});

/**
 * Fixes the flagged issues of a completed evaluation: spins up a sandbox
 * with write access, lets the agent commit, then pushes the branch and opens a
 * PR. Started on demand by the startFix mutation. The fix branch name is passed
 * in (not derived inside the handler) so workflow replays stay deterministic.
 */
export const fixWorkflow = workflow.define({
  args: {
    reportId: v.id("evaluationReports"),
    docId: v.id("docs"),
    userId: v.id("users"),
    installationId: v.number(),
    baseBranch: v.optional(v.string()),
    fixBranchName: v.string(),
  },
  handler: async (step, args): Promise<void> => {
    // Both live outside the try so the finally can tear the sandbox down even
    // when prepare throws part-way through.
    let fixSandboxId: string | undefined;
    let sandboxRepoId: Id<"githubRepos"> | undefined;
    try {
      const fixData = await step.runQuery(
        internal.evaluationWorkflow.getFixData,
        { reportId: args.reportId, docId: args.docId },
      );
      sandboxRepoId = fixData.repoId;

      const baseBranch = args.baseBranch ?? FALLBACK_GIT_BASE_BRANCH;

      ({ sandboxId: fixSandboxId } = await prepareSandboxSteps(step, {
        installationId: args.installationId,
        repoOwner: fixData.repoOwner,
        repoName: fixData.repoName,
        ephemeral: true,
        repoId: fixData.repoId,
        streamingEntityId: String(args.reportId),
        baseBranch,
        branchName: args.fixBranchName,
      }));

      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId: fixSandboxId,
        entityId: String(args.reportId),
        prompt: fixData.prompt,
        userId: args.userId,
        completionMutation: "evaluationWorkflow:handleFixCompletion",
        entityIdField: "reportId",
        model: "sonnet",
        allowedTools: "Read,Write,Edit,Bash,Glob,Grep",
        repoId: fixData.repoId,
      });

      const fixResult = await step.awaitEvent(fixCompleteEvent);

      if (fixResult.success) {
        const pushResult = await step.runAction(
          internal.sandbox.pushSandboxBranch,
          {
            sandboxId: fixSandboxId,
            installationId: args.installationId,
            repoOwner: fixData.repoOwner,
            repoName: fixData.repoName,
            repoId: fixData.repoId,
            branchName: args.fixBranchName,
          },
        );

        // No commits pushed → the fix agent changed nothing; a PR attempt
        // would only 404 against a branch origin never received.
        if (!pushResult.pushed) {
          await step.runMutation(internal.evaluationWorkflow.saveFixError, {
            reportId: args.reportId,
            error: "Fix agent completed without committing any code changes",
          });
          return;
        }

        const prUrl = await step.runAction(
          internal.taskWorkflowActions.createPullRequest,
          {
            installationId: args.installationId,
            repoOwner: fixData.repoOwner,
            repoName: fixData.repoName,
            branchName: args.fixBranchName,
            baseBranch,
            title: `Fix: ${fixData.docTitle}`,
            body: buildPrBody([
              {
                heading: "Fix",
                content: fixData.prDescription ?? "No description",
              },
            ]),
            labels: ["eva", "eval-fix"],
          },
        );

        await step.runMutation(internal.evaluationWorkflow.saveFixResult, {
          reportId: args.reportId,
          prUrl,
        });
      } else {
        await step.runMutation(internal.evaluationWorkflow.saveFixError, {
          reportId: args.reportId,
          error: fixResult.error ?? "Fix workflow failed",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Fix workflow failed";
      await step.runMutation(internal.evaluationWorkflow.saveWorkflowFailure, {
        reportId: args.reportId,
        error: errorMessage,
      });
      throw error;
    } finally {
      // The sandbox is ephemeral: the branch is already pushed by this point, so
      // nothing references the VM. Delete it or it idles until the provider
      // reaps it. Best-effort — a failed delete must not fail the workflow.
      if (fixSandboxId && sandboxRepoId) {
        try {
          await step.runAction(internal.sandbox.deleteSandbox, {
            sandboxId: fixSandboxId,
            repoId: sandboxRepoId,
          });
        } catch (cleanupError) {
          console.error("Failed to cleanup eval-fix sandbox:", cleanupError);
        }
      }
    }
  },
});

// --- Supporting internal functions ---

/** Sets the evaluation report status to running. */
export const setRunning = internalMutation({
  args: { reportId: v.id("evaluationReports") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: "running",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Fetches document and repo data and builds the evaluation prompt with requirements. */
export const getDocData = internalQuery({
  args: { docId: v.id("docs") },
  returns: v.object({
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    prompt: v.string(),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const rootDirectory = repo.rootDirectory ?? "";
    const rootDirInstruction = rootDirectory
      ? `\nIMPORTANT: Unless the user mentions otherwise, focus your evaluation on the app at "${rootDirectory}".`
      : "";

    // The document itself is the specification. The agent explores the codebase
    // and reports whatever issues it finds, ranked by severity — no fixed
    // checklist, so the result set may differ between runs.
    const prompt = `You are a QA engineer reviewing whether a codebase satisfies a specification document.

## Specification: ${doc.title}
${doc.content}

## Phase 1: Explore
Use the specification above as the source of truth. Search the codebase (routes, components, API handlers, schemas, business logic) for anything that is missing, incomplete, broken, or contradicts the specification.

## Phase 2: Report issues
Output ONLY valid JSON listing the issues you found, ranked most severe first:
{"issues": [{"title": "...", "description": "...", "severity": "critical", "filePaths": ["..."], "suggestedFix": "..."}], "summary": "..."}

Rules:
- Report only real gaps between the spec and the code; if the code fully satisfies the spec, return an empty "issues" array.
- "severity" must be one of: "critical", "high", "medium", "low".
- "title": short label for the issue. "description": plain-language explanation of the gap.
- "filePaths" and "suggestedFix" are optional but helpful when known.
- "summary": one-sentence overview of the codebase's state against the spec.

No markdown, no explanation, no text outside the JSON.${rootDirInstruction}`;

    return {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: doc.repoId,
      prompt,
    };
  },
});

/**
 * Schema for the LLM evaluation JSON. Per-field `.catch()` defaults fold
 * validation and fallback values into a single parse: a malformed issue collapses
 * to a default entry, an unknown severity becomes "medium", a missing/non-array
 * `issues` becomes an empty list, and a non-string summary becomes a default.
 */
const evalJsonSchema = z
  .object({
    issues: z
      .array(
        z
          .object({
            title: z.string().catch("Untitled issue"),
            description: z.string().catch(""),
            severity: z
              .enum(["critical", "high", "medium", "low"])
              .catch("medium"),
            filePaths: z.array(z.string()).optional().catch(undefined),
            suggestedFix: z.string().optional().catch(undefined),
          })
          .catch({
            title: "Untitled issue",
            description: "",
            severity: "medium",
            filePaths: undefined,
            suggestedFix: undefined,
          }),
      )
      .catch([]),
    summary: z.string().catch("Evaluation completed"),
  })
  .catch({ issues: [], summary: "Evaluation completed" });

/** Saves evaluation results, parsing the LLM JSON into a severity-ranked issue list. */
export const saveResult = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.reportId));

    const report = await ctx.db.get(args.reportId);
    if (!report) return null;

    if (args.success && args.result) {
      const { json } = llmJson.extract(args.result);
      if (json.length > 0) {
        const parsed = evalJsonSchema.parse(json[0]);

        const issues = parsed.issues.map((issue, i) => ({
          id: `issue-${i}`,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          filePaths: issue.filePaths,
          suggestedFix: issue.suggestedFix,
        }));

        await ctx.db.patch(args.reportId, {
          status: "completed",
          issues,
          summary: parsed.summary,
          activeWorkflowId: undefined,
          updatedAt: Date.now(),
        });
        return null;
      }
    }

    await ctx.db.patch(args.reportId, {
      status: "error",
      error: args.error || "Failed to parse evaluation results",
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Records a workflow-level failure, handling both eval and fix phase errors. */
export const saveWorkflowFailure = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.reportId));

    const report = await ctx.db.get(args.reportId);
    if (!report) return null;
    if (report.status === "completed") {
      if (report.fixStatus === "fixing") {
        await ctx.db.patch(args.reportId, {
          fixStatus: "fix_error",
          activeWorkflowId: undefined,
          updatedAt: Date.now(),
        });
      }
      return null;
    }
    if (report.status === "error" && report.activeWorkflowId === undefined) {
      return null;
    }

    await ctx.db.patch(args.reportId, {
      status: "error",
      error: args.error,
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Called by the sandbox via Convex HTTP API (authenticated with Clerk JWT).
 */
export const handleCompletion = authMutation({
  args: {
    reportId: v.id("evaluationReports"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSandboxCaller(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report || !report.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, report.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await sendCompletionEvent(ctx, evalCompleteEvent, report.activeWorkflowId, {
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
    });

    await recordCompletionLog(ctx, {
      entityType: "evaluation",
      entityId: String(args.reportId),
      entityTitle: "Evaluation Report",
      repoId: report.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    return null;
  },
});

/** Fetches failed evaluation results and builds the fix prompt and PR description. */
export const getFixData = internalQuery({
  args: { reportId: v.id("evaluationReports"), docId: v.id("docs") },
  returns: v.object({
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    docTitle: v.string(),
    prompt: v.string(),
    prDescription: v.string(),
  }),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");

    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const rootDirectory = repo.rootDirectory ?? "";
    const rootDirInstruction = rootDirectory
      ? `\nIMPORTANT: Unless the user mentions otherwise, focus your changes on the app at "${rootDirectory}".`
      : "";

    const issues = report.issues ?? [];

    const prompt = `You are a senior software engineer. Your task is to fix the issues flagged against this codebase.

## Feature: ${doc.title}

## Issues to fix:
${issues.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.title}\n   ${issue.description}${issue.filePaths && issue.filePaths.length > 0 ? `\n   Files: ${issue.filePaths.join(", ")}` : ""}${issue.suggestedFix ? `\n   Suggested fix: ${issue.suggestedFix}` : ""}`).join("\n")}

## Instructions:
1. Explore the codebase to understand the current implementation
2. Fix each issue by making the necessary code changes
3. After making changes, commit your work with a clear commit message
4. Do NOT push. Eva publishes the branch after you finish successfully.
5. Make sure your changes don't break existing functionality

Rules:
- Make minimal, focused changes to fix only the flagged issues
- Follow existing code patterns and conventions
- Do not refactor unrelated code
- Do NOT run git push or gh pr commands${rootDirInstruction}`;

    const prDescription = `## Evaluation Fix

Automatically generated fix for issues flagged in **${doc.title}**.

### Issues Fixed:
${issues.map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.description}`).join("\n")}

---
*Implemented by Eva*`;

    return {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: doc.repoId,
      docTitle: doc.title,
      prompt,
      prDescription,
    };
  },
});

/** Saves the fix result with the PR URL and marks fix as completed. */
export const saveFixResult = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    prUrl: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.reportId));

    await ctx.db.patch(args.reportId, {
      fixStatus: "fix_completed",
      prUrl: args.prUrl ?? undefined,
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Marks the fix phase as errored and clears the active workflow. */
export const saveFixError = internalMutation({
  args: {
    reportId: v.id("evaluationReports"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.reportId));

    await ctx.db.patch(args.reportId, {
      fixStatus: "fix_error",
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Receives sandbox fix completion callback and forwards the event to the active workflow. */
export const handleFixCompletion = authMutation({
  args: {
    reportId: v.id("evaluationReports"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSandboxCaller(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report || !report.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, report.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await sendCompletionEvent(ctx, fixCompleteEvent, report.activeWorkflowId, {
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
    });

    await recordCompletionLog(ctx, {
      entityType: "evaluation",
      entityId: String(args.reportId),
      entityTitle: "Evaluation Fix",
      repoId: report.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    return null;
  },
});

/**
 * Public mutation to start an evaluation workflow from the frontend. Idempotent
 * per doc: if an evaluation is already pending or running, returns its report id
 * instead of starting a duplicate (keeps the "test all" loop safe).
 */
export const startEvaluation = authMutation({
  args: {
    docId: v.id("docs"),
    repoId: v.id("githubRepos"),
    branchName: v.optional(v.string()),
  },
  returns: v.id("evaluationReports"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.repoId !== args.repoId) {
      throw new Error("Document not found");
    }
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Document not found");
    }
    if (doc.content.trim().length === 0) {
      throw new Error("Add content to this document before running a test");
    }

    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repository not found");

    const existing = await ctx.db
      .query("evaluationReports")
      .withIndex("by_doc", (q) => q.eq("docId", args.docId))
      .collect();
    const active = existing.find(
      (r) => r.status === "pending" || r.status === "running",
    );
    if (active) return active._id;

    const now = Date.now();
    const reportId = await ctx.db.insert("evaluationReports", {
      repoId: args.repoId,
      docId: args.docId,
      status: "pending",
      issues: [],
      branchName: args.branchName,
      createdAt: now,
      updatedAt: now,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.evaluationWorkflow.evaluationWorkflow,
      {
        reportId,
        docId: args.docId,
        userId: ctx.userId,
        installationId: repo.installationId,
        branchName: args.branchName,
      },
    );

    await trackEvaluationWorkflow(ctx, reportId, workflowId);

    return reportId;
  },
});

/**
 * Public mutation to start an opt-in fix for a completed evaluation that has
 * flagged issues. Idempotent: returns without starting if a fix is already
 * running or has completed. Retrying after a fix error uses a fresh branch name.
 */
export const startFix = authMutation({
  args: { reportId: v.id("evaluationReports") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("Report not found");
    if (!(await hasRepoAccess(ctx.db, report.repoId, ctx.userId))) {
      throw new Error("Report not found");
    }
    if (report.activeWorkflowId !== undefined) return null;
    if (report.status !== "completed") {
      throw new Error("Evaluation is not complete");
    }
    if ((report.issues ?? []).length === 0) {
      throw new Error("No issues to fix");
    }
    if (report.fixStatus === "fixing" || report.fixStatus === "fix_completed") {
      return null;
    }

    const repo = await ctx.db.get(report.repoId);
    if (!repo) throw new Error("Repository not found");

    // Retries need a unique branch — the previous push is not forced, so reusing
    // the name would fail if the prior attempt already pushed.
    const base = `eva/eval-fix-${String(args.reportId).slice(-8)}`;
    const fixBranchName = report.fixBranchName
      ? `${base}-r${Date.now().toString(36)}`
      : base;

    await ctx.db.patch(args.reportId, {
      fixStatus: "fixing",
      fixBranchName,
      updatedAt: Date.now(),
    });

    const workflowId = await workflow.start(
      ctx,
      internal.evaluationWorkflow.fixWorkflow,
      {
        reportId: args.reportId,
        docId: report.docId,
        userId: ctx.userId,
        installationId: repo.installationId,
        baseBranch: report.branchName,
        fixBranchName,
      },
    );

    await trackEvaluationWorkflow(ctx, args.reportId, workflowId);

    return null;
  },
});
