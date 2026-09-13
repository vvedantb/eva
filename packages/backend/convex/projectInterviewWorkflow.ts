import { v } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "./workflowManager";
import { authMutation, getProjectWithAccess } from "./functions";
import { rejectSandboxCaller, requireSandboxCaller } from "./_auth/sandboxIdentity";
import { turnCheckpointArgs, workflowCompleteValidator } from "./validators";
import { trackProjectWorkflow } from "./workflowWatchdog";
import { ensureSandboxStartedSteps } from "./_sandbox_runtime/resumeSandboxSteps";
import { PROJECT_INTERVIEW_SYSTEM_PROMPT, SPEC_SYSTEM_PROMPT } from "./prompts";
import {
  clearStreamingActivity,
  extractFirstJsonValue,
  recordCompletionLog,
  sendCompletionEvent,
} from "./_taskWorkflow/helpers";
import {
  getProjectConversation,
  setProjectConversation,
  setProjectGeneratedSpec,
} from "./_projects/helpers";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";

const projectInterviewCompleteEvent = defineEvent({
  name: "projectInterviewComplete",
  validator: workflowCompleteValidator,
});

const interviewSaveOutcomeValidator = v.union(
  v.literal("question"),
  v.literal("ready"),
  v.literal("error"),
);

/** Stored on the assistant row when the interview agent signals readiness. */
const INTERVIEW_COMPLETE_CONTENT = JSON.stringify({ interviewComplete: true });

const interviewReadySchema = z.object({ ready: z.boolean() });

function isInterviewReady(parsed: unknown): boolean {
  return interviewReadySchema.safeParse(parsed).data?.ready === true;
}

/** Builds a prompt that asks one implementation-focused question. Session persistence provides prior context. */
function buildQuestionPrompt(
  featureDescription: string,
  rejectionReason?: string,
): string {
  let prompt = `## Feature Request\n"${featureDescription}"\n\n`;

  if (rejectionReason) {
    prompt += `## Important Context\nThe user previously received a generated plan but rejected it with this feedback: "${rejectionReason}"\nAsk a question that directly addresses what the user felt was missing or wrong.\n\n`;
  }

  prompt += `## Your Task
Ask ONE question about a decision that would actually affect how this feature gets built. Ground it in the existing codebase where possible — reference real pages, components, or behaviors the user already has.

Include a brief example or scenario in the question so the user understands the tradeoff.

If you believe all critical decisions are covered, output {"ready": true} instead.

Output ONLY valid JSON:
{"question": "your question", "options": [{"label": "Short name", "description": "Explanation"}]}
OR
{"ready": true}`;

  return prompt;
}

/** Replaces the content and activity log of the last entry in a conversation history array, stamping finishedAt. */
function updateLastConversationEntry<
  T extends {
    role: "user" | "assistant";
    content: string;
    activityLog?: string;
    finishedAt?: number;
  },
>(history: T[], content: string, activityLog: string | null | undefined): T[] {
  const updated = [...history];
  const last = updated[updated.length - 1];
  if (last) {
    last.content = content;
    last.activityLog = activityLog || undefined;
    last.finishedAt = Date.now();
  }
  return updated;
}

// --- Workflow definition ---

/** Runs a single project interview step: prepares sandbox, asks one question, and saves the result. */
export const projectInterviewWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    featureDescription: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
    rejectionReason: v.optional(v.string()),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Fetch project + repo data
    const projectData = await step.runQuery(
      internal.projectInterviewWorkflow.getProjectData,
      { projectId: args.projectId },
    );

    // Step 2: Add empty assistant message for streaming
    await step.runMutation(
      internal.projectInterviewWorkflow.addEmptyAssistant,
      { projectId: args.projectId },
    );

    const questionPrompt = buildQuestionPrompt(
      args.featureDescription,
      args.rejectionReason,
    );
    const fullPrompt = `${PROJECT_INTERVIEW_SYSTEM_PROMPT} ${questionPrompt}`;

    // Use the shared project-preview lifecycle so the sandbox id is persisted
    // on the project (otherwise every answer would spawn a fresh sandbox) and
    // the card/sidebar "active" indicator lights up while the interview runs.
    try {
      if (projectData.sandboxId) {
        // Thaw an archived/stopped sandbox across polling steps first so a
        // cold-storage restore can exceed the per-action 10-minute limit; the
        // surrounding catch handles thaw failures.
        await ensureSandboxStartedSteps(step, {
          sandboxId: projectData.sandboxId,

          repoId: projectData.repoId,
        });
      }
      const { sandboxId } = await step.runAction(
        internal.sandbox.startProjectPreviewSandbox,
        {
          projectId: args.projectId,
          existingSandboxId: projectData.sandboxId,

          installationId: args.installationId,
          repoOwner: projectData.repoOwner,
          repoName: projectData.repoName,
          branchName: projectData.branchName,
          baseBranch: projectData.baseBranch,
          repoId: projectData.repoId,
          // Interview agents only read the repo; skip convex import / env setup.
          skipStartupCommands: true,
        },
      );

      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId,
        entityId: args.projectId,
        prompt: fullPrompt,
        userId: args.userId,
        completionMutation: "projectInterviewWorkflow:handleCompletion",
        entityIdField: "projectId",
        model: "sonnet",
        allowedTools: "Read,Glob,Grep",
        repoId: projectData.repoId,
        sessionPersistenceId: args.projectId,
      });

      // Step 4: Wait for callback
      const result = await step.awaitEvent(projectInterviewCompleteEvent);

      // Step 5: Save the result; chain spec generation when the agent signals ready.
      const outcome = await step.runMutation(
        internal.projectInterviewWorkflow.saveResult,
        {
          projectId: args.projectId,
          success: result.success,
          result: result.result,
          error: result.error,
          activityLog: result.activityLog,
        },
      );
      if (outcome === "ready") {
        await step.runMutation(
          internal.projectInterviewWorkflow.startSpecWorkflowInternal,
          {
            projectId: args.projectId,
            featureDescription: args.featureDescription,
            userId: args.userId,
            installationId: args.installationId,
          },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project interview failed";
      await step.runMutation(internal.projectInterviewWorkflow.saveResult, {
        projectId: args.projectId,
        success: false,
        result: null,
        error: message,
        activityLog: message,
      });
      throw error;
    }
  },
});

// --- Supporting internal functions ---

/** Fetches project and repository data needed for sandbox preparation. */
export const getProjectData = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.object({
    sandboxId: v.optional(v.string()),

    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    branchName: v.string(),
    baseBranch: v.string(),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    // During interview/spec the project usually has no branch yet, so fall back
    // to the repo's default branch — the sandbox just needs a valid checkout.
    const branchName =
      project.branchName ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
    const baseBranch =
      project.baseBranch ?? repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;

    return {
      sandboxId: project.sandboxId,

      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: project.repoId,
      branchName,
      baseBranch,
    };
  },
});

/** Appends an empty assistant entry to the project conversation for streaming updates. */
export const addEmptyAssistant = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");

    const conversation = await getProjectConversation(ctx.db, args.projectId);
    await setProjectConversation(ctx.db, args.projectId, [
      ...conversation,
      {
        role: "assistant",
        content: "",
        activityLog: "",
        startedAt: Date.now(),
      },
    ]);
    return null;
  },
});

/** Saves the interview workflow result, parsing the LLM JSON and updating the project conversation. */
export const saveResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
  },
  returns: interviewSaveOutcomeValidator,
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.projectId));

    const project = await ctx.db.get(args.projectId);
    if (!project) return "error";

    const conversation = await getProjectConversation(ctx.db, args.projectId);

    if (!args.success || !args.result) {
      const messages = updateLastConversationEntry(
        conversation,
        JSON.stringify({ error: true }),
        args.activityLog,
      );
      await setProjectConversation(ctx.db, args.projectId, messages);
      await ctx.db.patch(args.projectId, {
        activeWorkflowId: undefined,
        reviewProjectSandboxStatus: "closed",
        lastSandboxActivity: Date.now(),
      });
      return "error";
    }

    const parsed = extractFirstJsonValue(args.result);
    if (parsed === undefined) {
      const messages = updateLastConversationEntry(
        conversation,
        JSON.stringify({ error: true }),
        args.activityLog,
      );
      await setProjectConversation(ctx.db, args.projectId, messages);
      await ctx.db.patch(args.projectId, {
        activeWorkflowId: undefined,
        reviewProjectSandboxStatus: "closed",
        lastSandboxActivity: Date.now(),
      });
      return "error";
    }

    if (isInterviewReady(parsed)) {
      const messages = updateLastConversationEntry(
        conversation,
        INTERVIEW_COMPLETE_CONTENT,
        args.activityLog,
      );
      await setProjectConversation(ctx.db, args.projectId, messages);
      await ctx.db.patch(args.projectId, {
        activeWorkflowId: undefined,
        lastSandboxActivity: Date.now(),
      });
      return "ready";
    }

    const messages = updateLastConversationEntry(
      conversation,
      JSON.stringify(parsed),
      args.activityLog,
    );
    await setProjectConversation(ctx.db, args.projectId, messages);
    await ctx.db.patch(args.projectId, {
      activeWorkflowId: undefined,
      lastSandboxActivity: Date.now(),
    });
    return "question";
  },
});

/** Starts spec generation from a workflow step after interview completes (internal). */
export const startSpecWorkflowInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    featureDescription: v.string(),
    userId: v.id("users"),
    installationId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.activeWorkflowId) return null;

    const workflowId = await workflow.start(
      ctx,
      internal.projectInterviewWorkflow.projectSpecWorkflow,
      {
        projectId: args.projectId,
        featureDescription: args.featureDescription,
        userId: args.userId,
        installationId: args.installationId,
      },
    );

    await trackProjectWorkflow(ctx, args.projectId, workflowId);
    return null;
  },
});

/**
 * Called by sandbox via Convex HTTP API (authenticated with Clerk JWT).
 */
export const handleCompletion = authMutation({
  args: {
    projectId: v.id("projects"),
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
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.activeWorkflowId) return null;
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);

    await sendCompletionEvent(
      ctx,
      projectInterviewCompleteEvent,
      project.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "project",
      entityId: String(args.projectId),
      entityTitle: project.title,
      repoId: project.repoId,
      rawResultEvent: args.rawResultEvent,
      projectId: args.projectId,
    });

    return null;
  },
});

/**
 * Public mutation to start a project interview question.
 */
export const startInterview = authMutation({
  args: {
    projectId: v.id("projects"),
    featureDescription: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
    rejectionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (project.activeWorkflowId) return null;

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.projectInterviewWorkflow.projectInterviewWorkflow,
      {
        projectId: args.projectId,
        featureDescription: args.featureDescription,
        previousAnswers: args.previousAnswers,
        rejectionReason: args.rejectionReason,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectWorkflow(ctx, args.projectId, workflowId);

    return null;
  },
});

/**
 * Public mutation to start spec generation after interview is complete.
 */
export const startSpec = authMutation({
  args: {
    projectId: v.id("projects"),
    featureDescription: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (project.activeWorkflowId) return null;

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.projectInterviewWorkflow.projectSpecWorkflow,
      {
        projectId: args.projectId,
        featureDescription: args.featureDescription,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackProjectWorkflow(ctx, args.projectId, workflowId);

    return null;
  },
});

// --- Spec generation workflow (when interview is ready) ---

/** Generates an implementation spec from completed interview answers using a sandbox agent. */
export const projectSpecWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    featureDescription: v.string(),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    const projectData = await step.runQuery(
      internal.projectInterviewWorkflow.getProjectData,
      { projectId: args.projectId },
    );

    await step.runMutation(
      internal.projectInterviewWorkflow.addEmptyAssistant,
      { projectId: args.projectId },
    );

    const prompt = `${SPEC_SYSTEM_PROMPT}

Feature: "${args.featureDescription}"

Based on the interview conversation above, generate an implementation spec with 2-5 tasks. Each task should represent a complete ownership boundary (e.g., "backend infrastructure" or "UI integration"), not a single micro-edit. Tasks should be comprehensive enough that completing one task means that entire area of the codebase is done.

Output ONLY valid JSON.`;

    try {
      if (projectData.sandboxId) {
        // Thaw an archived/stopped sandbox across polling steps first so a
        // cold-storage restore can exceed the per-action 10-minute limit; the
        // surrounding catch handles thaw failures.
        await ensureSandboxStartedSteps(step, {
          sandboxId: projectData.sandboxId,

          repoId: projectData.repoId,
        });
      }
      const { sandboxId } = await step.runAction(
        internal.sandbox.startProjectPreviewSandbox,
        {
          projectId: args.projectId,
          existingSandboxId: projectData.sandboxId,

          installationId: args.installationId,
          repoOwner: projectData.repoOwner,
          repoName: projectData.repoName,
          branchName: projectData.branchName,
          baseBranch: projectData.baseBranch,
          repoId: projectData.repoId,
          // Interview agents only read the repo; skip convex import / env setup.
          skipStartupCommands: true,
        },
      );

      await step.runAction(internal.sandbox.launchOnExistingSandbox, {
        sandboxId,
        entityId: args.projectId,
        prompt,
        userId: args.userId,
        completionMutation: "projectInterviewWorkflow:handleSpecCompletion",
        entityIdField: "projectId",
        model: "sonnet",
        allowedTools: "Read,Glob,Grep",
        repoId: projectData.repoId,
        sessionPersistenceId: args.projectId,
      });

      const result = await step.awaitEvent(projectInterviewCompleteEvent);

      await step.runMutation(internal.projectInterviewWorkflow.saveSpecResult, {
        projectId: args.projectId,
        success: result.success,
        result: result.result,
        activityLog: result.activityLog,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Project spec failed";
      await step.runMutation(internal.projectInterviewWorkflow.saveSpecResult, {
        projectId: args.projectId,
        success: false,
        result: null,
        activityLog: message,
      });
      throw error;
    }
  },
});

/** Receives sandbox spec completion callback and forwards the event to the active workflow. */
export const handleSpecCompletion = authMutation({
  args: {
    projectId: v.id("projects"),
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
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.activeWorkflowId) return null;
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);

    await sendCompletionEvent(
      ctx,
      projectInterviewCompleteEvent,
      project.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "project",
      entityId: String(args.projectId),
      entityTitle: project.title,
      repoId: project.repoId,
      rawResultEvent: args.rawResultEvent,
      projectId: args.projectId,
    });

    return null;
  },
});

/** Saves the spec generation result, updating the project conversation and generated spec. */
export const saveSpecResult = internalMutation({
  args: {
    projectId: v.id("projects"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.projectId));

    const project = await ctx.db.get(args.projectId);
    if (!project) return null;

    const conversation = await getProjectConversation(ctx.db, args.projectId);

    if (args.success && args.result) {
      const parsed = extractFirstJsonValue(args.result);
      if (parsed !== undefined) {
        const specJson = JSON.stringify(parsed);
        const messages = updateLastConversationEntry(
          conversation,
          specJson,
          args.activityLog,
        );
        await setProjectConversation(ctx.db, args.projectId, messages);
        await setProjectGeneratedSpec(ctx.db, args.projectId, specJson);
        await ctx.db.patch(args.projectId, {
          phase: "finalized",
          activeWorkflowId: undefined,
          lastSandboxActivity: Date.now(),
        });
        return null;
      }
    }

    const messages = updateLastConversationEntry(
      conversation,
      JSON.stringify({ error: true }),
      args.activityLog,
    );
    await setProjectConversation(ctx.db, args.projectId, messages);
    await ctx.db.patch(args.projectId, {
      activeWorkflowId: undefined,
      lastSandboxActivity: Date.now(),
    });
    return null;
  },
});
