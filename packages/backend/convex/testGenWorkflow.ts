import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { authMutation } from "./functions";
import { getDocWithAccess } from "./_docs/access";
import { buildPrBody } from "./prBody";
import { buildTestGenBranchName } from "./_git/branchNames";
import { errorMessage } from "@vvedantb/server";
import { runOneShotAgent } from "./_agentJobs/runOneShotAgent";
import { startAgentJob, stopAgentJob } from "./_agentJobs/slot";

function sanitizeCommitTitle(title: string): string {
  return title.replace(/"/g, "'").trim() || "document";
}

function formatRequirements(requirements: string[]): string {
  if (requirements.length === 0) {
    return "1. No explicit requirements provided. Infer coverage from the feature description and user flows.";
  }
  return requirements
    .map((requirement, i) => `${i + 1}. ${requirement}`)
    .join("\n");
}

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

/** Runs the test generation workflow: prepares sandbox, generates tests, and creates a PR. */
export const testGenWorkflow = workflow.define({
  args: {
    docId: v.id("docs"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    const docData = await step.runQuery(internal.testGenWorkflow.getDocData, {
      docId: args.docId,
    });

    if (docData.alreadyCompleted) return;

    await step.runMutation(internal.testGenWorkflow.setRunning, {
      docId: args.docId,
    });

    const saveResult = async (success: boolean, testPrUrl?: string) => {
      await step.runMutation(internal.testGenWorkflow.saveResult, {
        docId: args.docId,
        success,
        testPrUrl,
      });
    };

    await runOneShotAgent(step, {
      ownerId: args.docId,
      userId: args.userId,
      installationId: args.installationId,
      repo: {
        id: docData.repoId,
        owner: docData.repoOwner,
        name: docData.repoName,
      },
      sandbox: { kind: "ephemeral", branchName: docData.branchName },
      agent: {
        model: "sonnet",
        allowedTools: "Read,Write,Edit,Bash,Glob,Grep",
      },
      prompt: docData.prompt,
      onResult: async (result, sandboxId) => {
        if (!result.success) {
          await saveResult(false);
          return;
        }
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
          if (!pushResult.pushed) {
            await saveResult(false);
            return;
          }
          const prUrl = await step.runAction(
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
          await saveResult(true, prUrl ?? undefined);
        } catch (error) {
          console.error(
            `[testGen] could not publish the branch or create a PR: ${errorMessage(error)}`,
          );
          await saveResult(false);
        }
      },
      onError: () => saveResult(false),
    });
  },
});

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

/** Saves the test generation outcome and frees the doc's slot. */
export const saveResult = internalMutation({
  args: {
    docId: v.id("docs"),
    success: v.boolean(),
    testPrUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    await ctx.db.patch(args.docId, {
      testGenStatus: args.success ? "completed" : "error",
      activeWorkflowId: undefined,
      ...(args.testPrUrl !== undefined
        ? { testPrUrl: args.testPrUrl, updatedAt: Date.now() }
        : {}),
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
    const doc = await getDocWithAccess(ctx.db, args.docId, ctx.userId);

    if (doc.testGenStatus !== "running") return null;
    await stopAgentJob(
      ctx,
      { kind: "doc", id: args.docId },
      doc.activeWorkflowId,
      { state: "cancelled" },
    );

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
    const doc = await getDocWithAccess(ctx.db, args.docId, ctx.userId);
    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    await startAgentJob(ctx, args.docId, () =>
      workflow.start(ctx, internal.testGenWorkflow.testGenWorkflow, {
        docId: args.docId,
        userId: ctx.userId,
        installationId: repo.installationId,
      }),
    );

    return null;
  },
});
