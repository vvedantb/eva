import { v } from "convex/values";
import type { WorkflowCtx } from "@convex-dev/workflow";
import { z } from "zod";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { authMutation } from "./functions";
import { getDocWithAccess } from "./_docs/access";
import { GENERATE_PROMPT, INTERVIEW_PROMPT } from "./prompts";
import { llmJson, parseFirstJsonValue } from "./_shared/llmJson";
import { jsonValue } from "./_jev/jsonValue";
import type { AgentJobResult } from "./_agentJobs/completion";
import { runOneShotAgent } from "./_agentJobs/runOneShotAgent";
import { startAgentJob } from "./_agentJobs/slot";

const generatedDocSchema = z.object({
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  userFlows: z
    .array(z.object({ name: z.string(), steps: z.array(z.string()) }))
    .optional(),
});

interface PreviousAnswer {
  question: string;
  answer: string;
}

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

function buildGeneratePrompt(
  docTitle: string,
  previousAnswers: PreviousAnswer[],
): string {
  const answersText = previousAnswers
    .map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  return `${GENERATE_PROMPT}

Feature: "${docTitle}"

Interview answers:
${answersText}

Generate a product description, acceptance criteria, and user journeys for this feature. Write everything from the user's perspective in plain language.

Output ONLY valid JSON.`;
}

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

const previousAnswersValidator = v.array(
  v.object({ question: v.string(), answer: v.string() }),
);

const docJobArgs = {
  docId: v.id("docs"),
  docTitle: v.string(),
  previousAnswers: previousAnswersValidator,
  userId: v.id("users"),
  installationId: v.number(),
};

async function runDocAgent(
  step: WorkflowCtx,
  args: {
    docId: Id<"docs">;
    userId: Id<"users">;
    installationId: number;
    prompt: string;
    save: (result: AgentJobResult) => Promise<void>;
  },
): Promise<void> {
  const docData = await step.runQuery(
    internal.docInterviewWorkflow.getDocData,
    { docId: args.docId },
  );
  await step.runMutation(internal.docInterviewWorkflow.addEmptyAssistant, {
    docId: args.docId,
  });
  await runOneShotAgent(step, {
    ownerId: args.docId,
    userId: args.userId,
    installationId: args.installationId,
    repo: {
      id: docData.repoId,
      owner: docData.repoOwner,
      name: docData.repoName,
    },
    sandbox: { kind: "reuse", sandboxId: docData.sandboxId },
    agent: { model: "sonnet", allowedTools: "Read,Glob,Grep" },
    prompt: args.prompt,
    onSandboxReady: async (sandboxId) => {
      await step.runMutation(internal.docInterviewWorkflow.saveDocSandboxId, {
        docId: args.docId,
        sandboxId,
      });
    },
    onResult: args.save,
    onError: (error) =>
      args.save({ success: false, result: null, error, activityLog: null }),
  });
}

/** Runs a single interview step: asks one question and saves it. */
export const docInterviewWorkflow = workflow.define({
  args: docJobArgs,
  handler: async (step, args): Promise<void> => {
    await runDocAgent(step, {
      docId: args.docId,
      userId: args.userId,
      installationId: args.installationId,
      prompt: `${INTERVIEW_PROMPT} ${buildQuestionPrompt(
        args.docTitle,
        args.previousAnswers,
      )}`,
      save: async (result) => {
        await step.runMutation(internal.docInterviewWorkflow.saveResult, {
          docId: args.docId,
          success: result.success,
          result: result.result,
          activityLog: result.activityLog,
        });
      },
    });
  },
});

/** The generate phase after the interview: writes the doc's content. */
export const docGenerateWorkflow = workflow.define({
  args: docJobArgs,
  handler: async (step, args): Promise<void> => {
    await runDocAgent(step, {
      docId: args.docId,
      userId: args.userId,
      installationId: args.installationId,
      prompt: buildGeneratePrompt(args.docTitle, args.previousAnswers),
      save: async (result) => {
        await step.runMutation(
          internal.docInterviewWorkflow.saveGenerateResult,
          {
            docId: args.docId,
            success: result.success,
            result: result.result,
            activityLog: result.activityLog,
          },
        );
      },
    });
  },
});

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

const docAgentReplyArgs = {
  docId: v.id("docs"),
  success: v.boolean(),
  result: v.union(v.string(), v.null()),
  activityLog: v.union(v.string(), v.null()),
};

/** Saves the interview workflow result, parsing the LLM JSON and updating interview history. */
export const saveResult = internalMutation({
  args: docAgentReplyArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    const parsed =
      args.success && args.result
        ? parseFirstJsonValue(args.result, jsonValue)
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

/** Saves the generate phase result, updating doc fields with parsed description, requirements, and user flows. */
export const saveGenerateResult = internalMutation({
  args: docAgentReplyArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.docId);
    if (!doc) return null;

    if (args.success && args.result) {
      const { json } = llmJson.extract(args.result);
      const parsed =
        json.length > 0 ? generatedDocSchema.safeParse(json[0]) : null;
      if (parsed?.success) {
        const generated = parsed.data;

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

const startDocJobArgs = {
  docId: v.id("docs"),
  docTitle: v.string(),
  previousAnswers: previousAnswersValidator,
};

/**
 * Public mutation to start a doc interview question workflow from the frontend.
 */
export const startInterview = authMutation({
  args: startDocJobArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await getDocWithAccess(ctx.db, args.docId, ctx.userId);
    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    await startAgentJob(ctx, args.docId, () =>
      workflow.start(ctx, internal.docInterviewWorkflow.docInterviewWorkflow, {
        ...args,
        userId: ctx.userId,
        installationId: repo.installationId,
      }),
    );
    return null;
  },
});

/**
 * Public mutation to start the generate phase from the frontend.
 */
export const startGenerate = authMutation({
  args: startDocJobArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await getDocWithAccess(ctx.db, args.docId, ctx.userId);
    const repo = await ctx.db.get(doc.repoId);
    if (!repo) throw new Error("Repository not found");

    await startAgentJob(ctx, args.docId, () =>
      workflow.start(ctx, internal.docInterviewWorkflow.docGenerateWorkflow, {
        ...args,
        userId: ctx.userId,
        installationId: repo.installationId,
      }),
    );
    return null;
  },
});
