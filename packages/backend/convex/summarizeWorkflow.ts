import { v } from "convex/values";
import { z } from "zod";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "./workflowManager";
import { authMutation, getSessionWithAccess } from "./functions";
import { rejectSandboxCaller, requireSandboxCaller } from "./_auth/sandboxIdentity";
import { turnCheckpointArgs, workflowCompleteValidator } from "./validators";
import { trackSessionWorkflow } from "./workflowWatchdog";
import {
  clearStreamingActivity,
  extractFirstJsonValue,
  recordCompletionLog,
  sendCompletionEvent,
} from "./_taskWorkflow/helpers";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";

const summarizeCompleteEvent = defineEvent({
  name: "summarizeComplete",
  validator: workflowCompleteValidator,
});

// --- Workflow definition ---

/** Runs a session summarization: prepares sandbox, generates bullet-point summary, and saves it. */
export const summarizeSessionWorkflow = workflow.define({
  args: {
    sessionId: v.id("sessions"),
    userId: v.id("users"),
    installationId: v.number(),
  },
  handler: async (step, args): Promise<void> => {
    const sessionData = await step.runQuery(
      internal.summarizeWorkflow.getSessionData,
      { sessionId: args.sessionId },
    );

    const { sandboxId } = await prepareSandboxSteps(step, {
      existingSandboxId: sessionData.sandboxId,

      installationId: args.installationId,
      repoOwner: sessionData.repoOwner,
      repoName: sessionData.repoName,
      repoId: sessionData.repoId,
      sessionPersistenceId: args.sessionId,
      sessionPersistenceKind: "sessions",
      streamingEntityId: `summary:${args.sessionId}`,
      ephemeral: false,
    });

    await step.runAction(internal.sandbox.launchOnExistingSandbox, {
      sandboxId,
      entityId: args.sessionId,
      streamingEntityId: `summary:${args.sessionId}`,
      prompt: sessionData.prompt,
      userId: args.userId,
      completionMutation: "summarizeWorkflow:handleCompletion",
      entityIdField: "sessionId",
      model: "haiku",
      allowedTools: "",
      repoId: sessionData.repoId,
      sessionPersistenceId: args.sessionId,
    });

    const result = await step.awaitEvent(summarizeCompleteEvent);

    await step.runMutation(internal.summarizeWorkflow.saveResult, {
      sessionId: args.sessionId,
      success: result.success,
      result: result.result,
      error: result.error,
    });
  },
});

// --- Supporting internal functions ---

/** Fetches session data, conversation history, and builds the summarization prompt. */
export const getSessionData = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    sandboxId: v.optional(v.string()),

    repoOwner: v.string(),
    repoName: v.string(),
    repoId: v.id("githubRepos"),
    prompt: v.string(),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.sessionId))
      .collect();

    const conversation = messages.map((m) => m.content).join("\n\n");

    const prompt = `Summarize this coding session as 3–5 ultra-concise bullet points. One outcome per line; max ~12 words each. User-visible results only — no file paths, symbols, or implementation detail.

Session log:
${conversation}

Respond with ONLY a JSON array of strings, no other text. Example: ["Login form validates email", "Fixed sign-out token refresh"]`;

    return {
      sandboxId: session.sandboxId,

      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: session.repoId,
      prompt,
    };
  },
});

/** Saves the summarization result, parsing the JSON array of bullet points onto the session. */
export const saveResult = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    success: v.boolean(),
    result: v.union(v.string(), v.null()),
    error: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await clearStreamingActivity(ctx, `summary:${args.sessionId}`);

    let summary: string[] = ["No summary available"];

    if (args.success && args.result) {
      const parsed = z
        .array(z.string())
        .safeParse(extractFirstJsonValue(args.result));
      if (parsed.success) {
        summary = parsed.data;
      }
    }

    await ctx.db.patch(args.sessionId, {
      summary,
      activeWorkflowId: undefined,
    });
    return null;
  },
});

/** Receives sandbox completion callback and forwards the event to the active summarize workflow. */
export const handleCompletion = authMutation({
  args: {
    sessionId: v.id("sessions"),
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
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );
    if (!session.activeWorkflowId) return null;

    await sendCompletionEvent(
      ctx,
      summarizeCompleteEvent,
      session.activeWorkflowId,
      {
        success: args.success,
        result: args.result,
        error: args.error,
        activityLog: args.activityLog,
      },
    );

    await recordCompletionLog(ctx, {
      entityType: "summarize",
      entityId: String(args.sessionId),
      entityTitle: `Summary: ${session.title}`,
      repoId: session.repoId,
      rawResultEvent: args.rawResultEvent,
    });

    return null;
  },
});

/** Frontend trigger to start the session summarization workflow. */
export const startSummarize = authMutation({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const session = await getSessionWithAccess(
      ctx.db,
      args.sessionId,
      ctx.userId,
    );

    const repo = await ctx.db.get(session.repoId);
    if (!repo) throw new Error("Repository not found");

    const workflowId = await workflow.start(
      ctx,
      internal.summarizeWorkflow.summarizeSessionWorkflow,
      {
        sessionId: args.sessionId,
        userId: ctx.userId,
        installationId: repo.installationId,
      },
    );

    await trackSessionWorkflow(ctx, args.sessionId, workflowId);

    return null;
  },
});
