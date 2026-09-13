import { v } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "./workflowManager";
import { authMutation, hasRepoAccess } from "./functions";
import { rejectSandboxCaller, requireSandboxCaller } from "./_auth/sandboxIdentity";
import { turnCheckpointArgs, workflowCompleteValidator } from "./validators";
import { trackDocWorkflow } from "./workflowWatchdog";
import { GENERATE_PROMPT, INTERVIEW_PROMPT } from "./prompts";
import {
  clearStreamingActivity,
  extractFirstJsonValue,
  llmJson,
  recordCompletionLog,
  sendCompletionEvent,
} from "./_taskWorkflow/helpers";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";

/** Shape of the JSON the doc-generation LLM step is expected to return. */
const generatedDocSchema = z.object({
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  userFlows: z
    .array(z.object({ name: z.string(), steps: z.array(z.string()) }))
    .optional(),
});

const docInterviewCompleteEvent = defineEvent({
  name: "docInterviewComplete",
  validator: workflowCompleteValidator,
});

interface PreviousAnswer {
  question: string;
  answer: string;
}

/** Builds a prompt that asks one product-focused question based on previous answers. */
function buildQuestionPrompt(
  docTitle: string,
  previousAnswers: PreviousAnswer[],
): string {
  let prompt = `## Document: "${docTitle}"\n\n`;

  if (previousAnswers.length > 0) {
    prompt += `## Already Decided\n`;
    previousAnswers.forEach((a, i) => {
      prompt += `${i + 1}. ${a.question} → ${a.answer}\n`;
    });
    prompt += "\n";
  }

  prompt += `## Your Task
Ask ONE question about this feature from a product perspective — who uses it, what they experience, what happens in edge cases, or what success looks like.

If you have enough information (typically after 3-6 questions), output {"ready": true} instead.

Output ONLY valid JSON:
{"question": "your question", "options": [{"label": "Short name", "description": "Explanation"}]}
OR
{"ready": true}`;

  return prompt;
}

/** Replaces the content and activity log of the last entry in an interview history array. */
function updateLastHistoryEntry<
  T extends {
    role: "user" | "assistant";
    content: string;
    activityLog?: string;
  },
>(history: T[], content: string, activityLog: string | null | undefined): T[] {
  const updated = [...history];
  const last = updated[updated.length - 1];
  if (last) {
    last.content = content;
    last.activityLog = activityLog || undefined;
  }
  return updated;
}

// --- Workflow definition ---

/** Runs a single interview step: prepares sandbox, asks one question, and saves the result. */
export const docInterviewWorkflow = workflow.define({
  args: {
    docId: v.id("docs"),
    docTitle: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    // Step 1: Fetch doc + repo data, build question prompt
    const docData = await step.runQuery(
      internal.docInterviewWorkflow.getDocData,
      { docId: args.docId },
    );

    // Step 2: Add empty assistant message for streaming
    await step.runMutation(internal.docInterviewWorkflow.addEmptyAssistant, {
      docId: args.docId,
    });

    const questionPrompt = buildQuestionPrompt(
      args.docTitle,
      args.previousAnswers,
    );
    const fullPrompt = `${INTERVIEW_PROMPT} ${questionPrompt}`;

    const { sandboxId } = await prepareSandboxSteps(step, {
      existingSandboxId: docData.sandboxId,

      installationId: args.installationId,
      repoOwner: docData.repoOwner,
      repoName: docData.repoName,
      repoId: docData.repoId,
      streamingEntityId: args.docId,
      ephemeral: false,
    });

    await step.runMutation(internal.docInterviewWorkflow.saveDocSandboxId, {
      docId: args.docId,
      sandboxId,
    });

    await step.runAction(internal.sandbox.launchOnExistingSandbox, {
      sandboxId,
      entityId: args.docId,
      prompt: fullPrompt,
      userId: args.userId,
      completionMutation: "docInterviewWorkflow:handleCompletion",
      entityIdField: "docId",
      model: "sonnet",
      allowedTools: "Read,Glob,Grep",
      repoId: docData.repoId,
    });

    // Step 4: Wait for callback
    const result = await step.awaitEvent(docInterviewCompleteEvent);

    // Step 5: Save the result (question or generated content)
    await step.runMutation(internal.docInterviewWorkflow.saveResult, {
      docId: args.docId,
      docTitle: args.docTitle,
      previousAnswers: args.previousAnswers,
      success: result.success,
      result: result.result,
      error: result.error,
      activityLog: result.activityLog,
    });
  },
});

// --- Supporting internal functions ---

/** Fetches document and repository data needed for sandbox preparation. */
export const getDocData = internalQuery({
  args: { docId: v.id("docs") },
  returns: v.object({
    sandboxId: v.optional(v.string()),

    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    return {
      sandboxId: doc.sandboxId,

      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: doc.repoId,
    };
  },
});

/** Persists sandbox ids on a doc after prepare so Vercel reuse works. */
export const saveDocSandboxId = internalMutation({
  args: {
    docId: v.id("docs"),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.docId, {
      sandboxId: args.sandboxId,
    });
    return null;
  },
});

/** Appends an empty assistant entry to the interview history for streaming updates. */
export const addEmptyAssistant = internalMutation({
  args: { docId: v.id("docs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");

    const history = doc.interviewHistory ?? [];
    history.push({
      role: "assistant",
      content: "",
      activityLog: "",
    });
    await ctx.db.patch(args.docId, { interviewHistory: history });
    return null;
  },
});

/** Saves the interview workflow result, parsing the LLM JSON and updating interview history. */
export const saveResult = internalMutation({
  args: {
    docId: v.id("docs"),
    docTitle: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.docId));

    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    const parsed =
      args.success && args.result
        ? extractFirstJsonValue(args.result)
        : undefined;
    const content =
      parsed === undefined
        ? JSON.stringify({ error: true })
        : JSON.stringify(parsed);

    const history = updateLastHistoryEntry(
      doc.interviewHistory ?? [],
      content,
      args.activityLog,
    );
    await ctx.db.patch(args.docId, {
      interviewHistory: history,
      activeWorkflowId: undefined,
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
    await requireSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await sendCompletionEvent(
      ctx,
      docInterviewCompleteEvent,
      doc.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "doc",
      entityId: String(args.docId),
      entityTitle: doc.title,
      repoId: doc.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    return null;
  },
});

/**
 * Public mutation to start a doc interview question workflow from the frontend.
 */
export const startInterview = authMutation({
  args: {
    docId: v.id("docs"),
    docTitle: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.docInterviewWorkflow.docInterviewWorkflow,
      {
        docId: args.docId,
        docTitle: args.docTitle,
        previousAnswers: args.previousAnswers,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackDocWorkflow(ctx, args.docId, workflowId);

    return null;
  },
});

/**
 * Separate workflow for the generate phase after interview is complete.
 */
export const docGenerateWorkflow = workflow.define({
  args: {
    docId: v.id("docs"),
    docTitle: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    const docData = await step.runQuery(
      internal.docInterviewWorkflow.getDocData,
      { docId: args.docId },
    );

    await step.runMutation(internal.docInterviewWorkflow.addEmptyAssistant, {
      docId: args.docId,
    });

    const answersText = args.previousAnswers
      .map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`)
      .join("\n\n");

    const prompt = `${GENERATE_PROMPT}

Feature: "${args.docTitle}"

Interview answers:
${answersText}

Generate a product description, acceptance criteria, and user journeys for this feature. Write everything from the user's perspective in plain language.

Output ONLY valid JSON.`;

    const { sandboxId } = await prepareSandboxSteps(step, {
      existingSandboxId: docData.sandboxId,

      installationId: args.installationId,
      repoOwner: docData.repoOwner,
      repoName: docData.repoName,
      repoId: docData.repoId,
      streamingEntityId: args.docId,
      ephemeral: false,
    });

    await step.runMutation(internal.docInterviewWorkflow.saveDocSandboxId, {
      docId: args.docId,
      sandboxId,
    });

    await step.runAction(internal.sandbox.launchOnExistingSandbox, {
      sandboxId,
      entityId: args.docId,
      prompt,
      userId: args.userId,
      completionMutation: "docInterviewWorkflow:handleGenerateCompletion",
      entityIdField: "docId",
      model: "sonnet",
      allowedTools: "Read,Glob,Grep",
      repoId: docData.repoId,
    });

    const result = await step.awaitEvent(docInterviewCompleteEvent);

    await step.runMutation(internal.docInterviewWorkflow.saveGenerateResult, {
      docId: args.docId,
      success: result.success,
      result: result.result,
      activityLog: result.activityLog,
    });
  },
});

/** Receives sandbox completion callback for the generate phase and forwards the event. */
export const handleGenerateCompletion = authMutation({
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
    await requireSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || !doc.activeWorkflowId) return null;
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    await sendCompletionEvent(
      ctx,
      docInterviewCompleteEvent,
      doc.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    );

    await ctx.db.insert("logs", {
      entityType: "doc",
      entityId: String(args.docId),
      entityTitle: doc.title,
      rawResultEvent: args.rawResultEvent,
      repoId: doc.repoId,
      createdAt: Date.now(),
    });

    return null;
  },
});

/** Saves the generate phase result, updating doc fields with parsed description, requirements, and user flows. */
export const saveGenerateResult = internalMutation({
  args: {
    docId: v.id("docs"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    activityLog: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, String(args.docId));

    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    if (args.success && args.result) {
      const { json } = llmJson.extract(args.result);
      const parsed =
        json.length > 0 ? generatedDocSchema.safeParse(json[0]) : null;
      if (parsed?.success) {
        const generated = parsed.data;

        // Update doc with generated content
        await ctx.db.patch(args.docId, {
          description: generated.description,
          requirements: generated.requirements,
          userFlows: generated.userFlows,
          updatedAt: Date.now(),
        });

        const history = updateLastHistoryEntry(
          doc.interviewHistory ?? [],
          JSON.stringify(json[0]),
          args.activityLog,
        );
        await ctx.db.patch(args.docId, {
          interviewHistory: history,
          activeWorkflowId: undefined,
        });
        return null;
      }
    }

    const history = updateLastHistoryEntry(
      doc.interviewHistory ?? [],
      JSON.stringify({ error: true }),
      args.activityLog,
    );
    await ctx.db.patch(args.docId, {
      interviewHistory: history,
      activeWorkflowId: undefined,
    });
    return null;
  },
});

/**
 * Public mutation to start the generate phase from the frontend.
 */
export const startGenerate = authMutation({
  args: {
    docId: v.id("docs"),
    docTitle: v.string(),
    previousAnswers: v.array(
      v.object({ question: v.string(), answer: v.string() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc) throw new Error("Doc not found");
    if (!(await hasRepoAccess(ctx.db, doc.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }

    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.docInterviewWorkflow.docGenerateWorkflow,
      {
        docId: args.docId,
        docTitle: args.docTitle,
        previousAnswers: args.previousAnswers,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackDocWorkflow(ctx, args.docId, workflowId);

    return null;
  },
});
