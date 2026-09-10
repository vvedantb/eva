import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow, cancelTrackedWorkflow } from "./workflowManager";
import { authMutation } from "./functions";
import { turnCheckpointArgs, workflowCompleteValidator } from "./validators";
import { trackDocWorkflow } from "./workflowWatchdog";
import {
  clearStreamingActivity,
  recordCompletionLog,
  sendCompletionEvent,
} from "./_taskWorkflow/helpers";
import { buildPrBody } from "./prBody";
import { buildTestGenBranchName } from "./_git/branchNames";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";

const testGenCompleteEvent = defineEvent({
  name: "testGenComplete",
  validator: workflowCompleteValidator,
});

/** Replaces double quotes with single quotes in a commit title for shell safety. */
function sanitizeCommitTitle(title: string): string {
  return title.replace(/"/g, "'").trim() || "document";
}

/** Formats a list of requirements as a numbered list for the test generation prompt. */
function formatRequirements(requirements: string[]): string {
  if (requirements.length === 0) {
    return "1. No explicit requirements provided. Infer coverage from the feature description and user flows.";
  }
  return requirements
    .map((requirement, i) => `${i + 1}. ${requirement}`)
    .join("\n");
}

/** Formats user flows as numbered markdown sections for the test generation prompt. */
function formatUserFlows(
  userFlows: Array<{ name: string; steps: string[] }>,
): string {
  if (userFlows.length === 0) {
    return "### Primary Flow\n1. No explicit user flows provided. Infer the main flow and key edge cases from the feature description.";
  }
  return userFlows
    .map((flow) => {
      const flowName = flow.name?.trim() || "Unnamed Flow";
      const steps =
        flow.steps.length > 0
          ? flow.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")
          : "1. No steps provided.";
      return `### ${flowName}\n${steps}`;
    })
    .join("\n\n");
}

// --- Workflow definition ---

/** Runs the test generation workflow: prepares sandbox, generates tests, and creates a PR. */
export const testGenWorkflow = workflow.define({
  args: {
    docId: v.id("docs"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Fetch doc data, check if already completed
    const docData = await step.runQuery(internal.testGenWorkflow.getDocData, {
      docId: args.docId,
    });

    if (docData.alreadyCompleted) return;

    // Step 2: Set status to running
    await step.runMutation(internal.testGenWorkflow.setRunning, {
      docId: args.docId,
    });

    // Declared outside the try so the finally can tear the sandbox down even
    // when prepare itself throws part-way through.
    let sandboxId: string | undefined;
    try {
      ({ sandboxId } = await prepareSandboxSteps(step, {
        installationId: args.installationId,
        repoOwner: docData.repoOwner,
        repoName: docData.repoName,
        ephemeral: true,
        branchName: docData.branchName,
        repoId: docData.repoId,
        streamingEntityId: args.docId,
      }));

      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId,
        entityId: args.docId,
        prompt: docData.prompt,
        userId: args.userId,
        completionMutation: "testGenWorkflow:handleCompletion",
        entityIdField: "docId",
        model: "sonnet",
        allowedTools: "Read,Write,Edit,Bash,Glob,Grep",
        repoId: docData.repoId,
      });

      // Step 4: Wait for callback
      const result = await step.awaitEvent(testGenCompleteEvent);

      let workflowSuccess = result.success;
      let workflowError = result.error;
      let prUrl: string | null = null;

      if (result.success) {
        try {
          const pushResult = await step.runAction(
            internal.sandbox.pushSandboxBranch,
            {
              sandboxId,
              installationId: args.installationId,
              repoOwner: docData.repoOwner,
              repoName: docData.repoName,
              repoId: docData.repoId,
              branchName: docData.branchName,
            },
          );

          if (pushResult.pushed) {
            prUrl = await step.runAction(
              internal.taskWorkflowActions.createPullRequest,
              {
                installationId: args.installationId,
                repoOwner: docData.repoOwner,
                repoName: docData.repoName,
                branchName: docData.branchName,
                title: `Add tests for ${docData.docTitle}`,
                body: buildPrBody([
                  {
                    heading: "Summary",
                    content: `Auto-generated tests for the **${docData.docTitle}** document.`,
                  },
                ]),
                labels: ["tests", "eva"],
              },
            );
          } else {
            // No commits pushed → the agent wrote no tests; fail cleanly
            // instead of letting a PR attempt 404 against a missing branch.
            workflowSuccess = false;
            workflowError =
              "Test generation completed without committing any code changes";
          }
        } catch (error) {
          workflowSuccess = false;
          workflowError = `Test generation completed locally, but Eva could not publish the branch or create a PR. ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      await step.runMutation(internal.testGenWorkflow.saveResult, {
        docId: args.docId,
        success: workflowSuccess,
        result: result.result,
        error: workflowError,
      });

      if (workflowSuccess && prUrl) {
        await step.runMutation(internal.testGenWorkflow.savePrUrl, {
          docId: args.docId,
          testPrUrl: prUrl,
        });
      }
    } finally {
      // The sandbox is ephemeral: nothing references it once the run is saved,
      // so it has to be deleted here or it idles until the provider reaps it.
      if (sandboxId) {
        try {
          await step.runAction(internal.sandbox.deleteSandbox, {
            sandboxId,
            repoId: docData.repoId,
          });
        } catch (cleanupError) {
          console.error("Failed to cleanup test-gen sandbox:", cleanupError);
        }
      }
    }
  },
});

// --- Supporting internal functions ---

/** Fetches doc and repo data and builds the test generation prompt with requirements and user flows. */
export const getDocData = internalQuery({
  args: { docId: v.id("docs") },
  returns: v.object({
    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    docTitle: v.string(),
    prompt: v.string(),
    branchName: v.string(),
    alreadyCompleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    if (doc.testGenStatus === "completed" && doc.testPrUrl) {
      return {
        repoOwner: repo.owner,
        repoName: repo.name,
        repoId: doc.repoId,
        docTitle: doc.title,
        prompt: "",
        branchName: "",
        alreadyCompleted: true,
      };
    }

    const branchName = buildTestGenBranchName(doc.title);
    const commitTitle = sanitizeCommitTitle(doc.title);

    const prompt = `You are a test engineer. Generate tests for the feature described below.

## Feature: ${doc.title}
${doc.description || "No description provided."}

## Requirements to test:
${formatRequirements(doc.requirements ?? [])}

## User Flows:
${formatUserFlows(doc.userFlows ?? [])}

## Steps:
1. Read CLAUDE.md for tech stack and testing conventions
2. Explore the codebase for existing test patterns and frameworks
3. Find the source code implementing this feature
4. Generate test files covering each requirement and user flow
5. Place tests alongside existing tests or in the appropriate directory
6. Match the existing testing framework and patterns
7. git add -A && git commit -m "test: add tests for ${commitTitle}"
8. Do NOT push. Eva publishes branch "${branchName}" after you finish successfully.

## Rules:
- Only generate test files, do NOT modify source code
- Cover each requirement with at least one test case
- Do NOT run the tests
- Do NOT run git push or gh pr commands`;

    return {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: doc.repoId,
      docTitle: doc.title,
      prompt,
      branchName,
      alreadyCompleted: false,
    };
  },
});

/** Sets the doc's test generation status to running and clears any previous PR URL. */
export const setRunning = internalMutation({
  args: { docId: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.docId, {
      testGenStatus: "running",
      testPrUrl: undefined,
    });
    return null;
  },
});

/** Saves the test generation result, marking the doc as completed or errored. */
export const saveResult = internalMutation({
  args: {
    docId: v.id("docs"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.docId));

    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    if (!args.success) {
      await ctx.db.patch(args.docId, {
        testGenStatus: "error",
        activeWorkflowId: undefined,
      });
      return null;
    }

    await ctx.db.patch(args.docId, {
      testGenStatus: "completed",
      activeWorkflowId: undefined,
    });

    return null;
  },
});

/** Stores the created PR URL on the doc after successful test generation. */
export const savePrUrl = internalMutation({
  args: {
    docId: v.id("docs"),
    testPrUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.docId, {
      testPrUrl: args.testPrUrl,
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
    docId: v.id("docs"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
    rawResultEvent: v.optional(v.string()),
    ...turnCheckpointArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;

    await sendCompletionEvent(ctx, testGenCompleteEvent, doc.activeWorkflowId, {
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
    });

    await recordCompletionLog(ctx, {
      entityType: "testGen",
      entityId: String(args.docId),
      entityTitle: `Test Gen: ${doc.title}`,
      repoId: doc.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    return null;
  },
});

/**
 * Public mutation to cancel a running test generation workflow.
 */
export const cancelTestGen = authMutation({
  args: { docId: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    await cancelTrackedWorkflow(ctx, doc.activeWorkflowId);

    await clearStreamingActivity(ctx, String(args.docId));

    await ctx.db.patch(args.docId, {
      testGenStatus: undefined,
      activeWorkflowId: undefined,
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Public mutation to start the test generation workflow.
 */
export const startTestGen = authMutation({
  args: {
    docId: v.id("docs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.testGenWorkflow.testGenWorkflow,
      {
        docId: args.docId,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackDocWorkflow(ctx, args.docId, workflowId);

    return null;
  },
});
