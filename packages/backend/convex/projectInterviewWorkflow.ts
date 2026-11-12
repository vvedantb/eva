import { v, type Infer } from "convex/values";
import type { WorkflowCtx } from "@convex-dev/workflow";
import { launchAgentStep } from "./_sandbox_runtime/agentLaunchStep";
import { settleAgentTurnCompletion } from "./_chat/turnStore";
import { z } from "zod";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { defineEvent } from "@convex-dev/workflow";
import { workflow } from "./workflowManager";
import { authMutation, getProjectWithAccess } from "./functions";
import {
  completionCallbackArgs,
  turnLeaseFenceArgs,
  workflowCompleteValidator,
} from "./validators";
import { trackProjectInterviewWorkflow } from "./workflowWatchdog";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";
import { ensureOwnedSession } from "./_sessions/ownedSession";
import { resolveSessionBaseBranch } from "./_sessions/baseBranch";
import { buildSessionBranchName } from "./_git/branchNames";
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
import {
  finishProjectInterview,
  interviewTurnEntityIds,
  isProjectInterviewing,
  projectInterviewWorkflowId,
  recordProjectInterviewSandbox,
} from "./_projects/interviewState";
import { finishTaskRunSandbox } from "./_sessions/sandbox";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { TurnLane } from "./validators";
import { sandboxStartupEntityId } from "@eva/shared";
import { errorMessage } from "@vvedantb/server";
import {
  TASK_CHAT_BUSY_ERROR,
  TASK_CHAT_BUSY_RETRY_MS,
} from "./_taskWorkflow/recovery";

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
    // Step 1: The project's session (created on first need) and repo data
    const projectData = await step.runMutation(
      internal.projectInterviewWorkflow.ensureInterviewSession,
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

    let held: InterviewSandbox | undefined;
    let outcome: Infer<typeof interviewSaveOutcomeValidator> = "error";
    try {
      held = await prepareInterviewSandbox(
        step,
        projectData,
        args.installationId,
      );

      await launchAgentStep(
        step,
        {
          sandboxId: held.sandboxId,
          entityId: args.projectId,
          prompt: fullPrompt,
          userId: args.userId,
          completionMutation: "projectInterviewWorkflow:handleCompletion",
          entityIdField: "projectId",
          model: "sonnet",
          allowedTools: "Read,Glob,Grep",
          repoId: projectData.repoId,
          sessionPersistenceId: args.projectId,
        },
        interviewTurnOwner(projectData),
      );

      // Step 4: Wait for callback
      const result = await step.awaitEvent(projectInterviewCompleteEvent);

      // Step 5: Save the result.
      outcome = await step.runMutation(
        internal.projectInterviewWorkflow.saveResult,
        {
          projectId: args.projectId,
          success: result.success,
          result: result.result,
          error: result.error,
          activityLog: result.activityLog,
        },
      );
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
    } finally {
      // The agent signalled ready: the release chains spec generation.
      await releaseInterviewSandbox(
        step,
        projectData,
        held,
        outcome === "ready"
          ? {
              featureDescription: args.featureDescription,
              userId: args.userId,
              installationId: args.installationId,
            }
          : undefined,
      );
    }
  },
});

// --- Supporting internal functions ---

/**
 * The interview's agent turn is filed under the project's session, in its
 * own lane: the session's open-turn reads (busy gates, idle pause, sidebar)
 * see it like a run's turn, while chat turns (lane unset) stay apart.
 * Completion, stop and the stall reconciler find it by lane
 * (`interviewTurnEntityIds`).
 */
function interviewTurnOwner(target: InterviewTarget): {
  entityId: Id<"sessions">;
  lane: TurnLane;
  sessionId: Id<"sessions">;
} {
  return {
    entityId: target.sessionId,
    lane: "interview",
    sessionId: target.sessionId,
  };
}

/** What `ensureInterviewSession` returns. */
const interviewSessionValidator = v.object({
  sessionId: v.id("sessions"),
  projectId: v.id("projects"),
  repoOwner: v.string(),
  repoName: v.string(),
  repoId: v.id("githubRepos"),
  branchName: v.string(),
  baseBranch: v.string(),
});

type InterviewTarget = Infer<typeof interviewSessionValidator>;

/**
 * The project's session (created on first need, `ensureOwnedSession`) and
 * what an interview or spec agent needs to run on its sandbox: its branch
 * and the repo. The sandbox itself is claimed like a task run's.
 */
export const ensureInterviewSession = internalMutation({
  args: { projectId: v.id("projects") },
  returns: interviewSessionValidator,
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");
    const { session } = await ensureOwnedSession(ctx, {
      kind: "project",
      project,
    });
    return {
      sessionId: session._id,
      projectId: project._id,
      repoOwner: repo.owner,
      repoName: repo.name,
      repoId: project.repoId,
      branchName: session.branchName || buildSessionBranchName(session._id),
      baseBranch: resolveSessionBaseBranch(session, repo),
    };
  },
});

/** The VM an interview or spec agent runs on, and whether the session holds it. */
type InterviewSandbox = {
  sandboxId: string;
  /** The session was `active` before: it stays `active` afterwards. */
  wasActive: boolean;
};

/** How many times an interview waits out a busy session before it fails. */
const INTERVIEW_CLAIM_MAX_WAITS = 10;

/**
 * The sandbox an interview or spec agent runs on, through the same session
 * lifecycle as a task run: the session is claimed (`closed` → `starting`,
 * the interview `started` → `claimed` with that attempt), its VM resumed or
 * a fresh one prepared and recorded (`claimed` → `prepared`), then attached
 * (`starting` → `active`, fenced by the claim's attempt), so the row never
 * reads `closed` over a running VM and no VM goes unrecorded. A start or
 * stop in flight is waited out (then the busy error). A failed prepare is
 * the claim's start failure. Interview agents only read the repo, so the
 * repo's startup commands are skipped.
 */
async function prepareInterviewSandbox(
  step: WorkflowCtx,
  target: InterviewTarget,
  installationId: number,
): Promise<InterviewSandbox> {
  const claimArgs = {
    sessionId: target.sessionId,
    interview: { projectId: target.projectId, workflowId: step.workflowId },
  };
  let claim = await step.runMutation(
    internal.sessions.claimSandboxForTaskRun,
    claimArgs,
  );
  for (
    let wait = 0;
    claim === null && wait < INTERVIEW_CLAIM_MAX_WAITS;
    wait++
  ) {
    claim = await step.runMutation(
      internal.sessions.claimSandboxForTaskRun,
      claimArgs,
      { runAfter: TASK_CHAT_BUSY_RETRY_MS },
    );
  }
  if (claim === null) throw new Error(TASK_CHAT_BUSY_ERROR);
  let sandboxId: string;
  try {
    ({ sandboxId } = await prepareSandboxSteps(step, {
      existingSandboxId: claim.sandboxId,
      installationId,
      repoOwner: target.repoOwner,
      repoName: target.repoName,
      repoId: target.repoId,
      ephemeral: false,
      streamingEntityId: sandboxStartupEntityId({
        kind: "session",
        sessionId: target.sessionId,
      }),
      baseBranch: target.baseBranch,
      branchName: target.branchName,
      skipStartupCommands: true,
    }));
  } catch (prepareError) {
    if (!claim.wasActive) {
      await step.runMutation(internal.sessions.sandboxError, {
        sessionId: target.sessionId,
        error: errorMessage(prepareError),
        startAttempt: claim.attempt,
      });
    }
    throw prepareError;
  }
  await step.runMutation(
    internal.projectInterviewWorkflow.recordInterviewSandbox,
    { projectId: target.projectId, workflowId: step.workflowId, sandboxId },
  );
  await step.runMutation(internal.sessions.attachTaskRunSandbox, {
    sessionId: target.sessionId,
    sandboxId,
    attempt: claim.attempt,
  });
  return { sandboxId, wasActive: claim.wasActive };
}

/** What spec generation needs when an interview chains it. */
const specStartValidator = v.object({
  featureDescription: v.string(),
  userId: v.id("users"),
  installationId: v.number(),
});

/** Releases the interview's sandbox; see `releaseInterview`. */
async function releaseInterviewSandbox(
  step: WorkflowCtx,
  target: InterviewTarget,
  held: InterviewSandbox | undefined,
  chainSpec: Infer<typeof specStartValidator> | undefined,
): Promise<void> {
  await step.runMutation(internal.projectInterviewWorkflow.releaseInterview, {
    projectId: target.projectId,
    sessionId: target.sessionId,
    workflowId: step.workflowId,
    held,
    chainSpec,
  });
}

/** Records the VM the interview prepared on its claim, before the attach. */
export const recordInterviewSandbox = internalMutation({
  args: {
    projectId: v.id("projects"),
    workflowId: v.string(),
    sandboxId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordProjectInterviewSandbox(
      ctx,
      args.projectId,
      args.workflowId,
      args.sandboxId,
    );
    return null;
  },
});

/**
 * The workflow is done (saved, failed, or never got a sandbox): the
 * interview ends (`finish`) in the same write that lets the sandbox go, so
 * nothing else can claim the session while this VM is still being released.
 * The VM stops through the session stop path unless the session was already
 * `active` (the reviewer has it open) or spec generation chains on it; a VM
 * the session never took stops directly (`finishTaskRunSandbox`). A stopped
 * interview (`stopProjectInterview`) already released the session's VM: a
 * late release (a step can run after its workflow was cancelled) then stops
 * only a VM of its own, and no spec chains.
 */
export const releaseInterview = internalMutation({
  args: {
    projectId: v.id("projects"),
    sessionId: v.id("sessions"),
    workflowId: v.string(),
    held: v.optional(
      v.object({ sandboxId: v.string(), wasActive: v.boolean() }),
    ),
    chainSpec: v.optional(specStartValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finished = await finishProjectInterview(
      ctx,
      args.projectId,
      args.workflowId,
    );
    const chainSpec = finished.ok ? args.chainSpec : undefined;
    if (args.held !== undefined) {
      // A stopped interview no longer owns the session's VM (a newer start
      // may have resumed it): only a VM the session never took stops here.
      await finishTaskRunSandbox(ctx, args.sessionId, args.held.sandboxId, {
        keepActive:
          !finished.ok || args.held.wasActive || chainSpec !== undefined,
      });
    }
    if (chainSpec !== undefined) {
      await startSpecWorkflow(ctx, args.projectId, chainSpec);
    }
    return null;
  },
});

/** Starts spec generation and records it as the project's interview. */
async function startSpecWorkflow(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  spec: Infer<typeof specStartValidator>,
): Promise<void> {
  const workflowId = await workflow.start(
    ctx,
    internal.projectInterviewWorkflow.projectSpecWorkflow,
    { projectId, ...spec },
  );
  await trackProjectInterviewWorkflow(ctx, projectId, workflowId);
}

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
    const parsed =
      args.success && args.result
        ? extractFirstJsonValue(args.result)
        : undefined;
    const outcome =
      parsed === undefined
        ? "error"
        : isInterviewReady(parsed)
          ? "ready"
          : "question";
    const content =
      outcome === "error"
        ? JSON.stringify({ error: true })
        : outcome === "ready"
          ? INTERVIEW_COMPLETE_CONTENT
          : JSON.stringify(parsed);
    await setProjectConversation(
      ctx.db,
      args.projectId,
      updateLastConversationEntry(conversation, content, args.activityLog),
    );
    // The interview stays `prepared` until `releaseInterview` lets the VM go.
    return outcome;
  },
});

/**
 * Called by sandbox via Convex HTTP API (authenticated with Clerk JWT).
 */
export const handleCompletion = authMutation({
  args: {
    projectId: v.id("projects"),
    ...completionCallbackArgs,
    ...turnLeaseFenceArgs,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    const workflowId = project ? projectInterviewWorkflowId(project) : undefined;
    if (!project || workflowId === undefined) return null;
    await getProjectWithAccess(ctx.db, args.projectId, ctx.userId);
    let settled = false;
    for (const entityId of await interviewTurnEntityIds(
      ctx.db,
      args.projectId,
    )) {
      settled = await settleAgentTurnCompletion(ctx, {
        entityId,
        lane: "interview",
        turnId: args.turnId,
        leaseGeneration: args.leaseGeneration,
        success: args.success,
        error: args.error,
      });
      if (settled) break;
    }
    if (!settled) return null;

    await sendCompletionEvent(ctx, projectInterviewCompleteEvent, workflowId, {
      success: args.success,
      result: args.result,
      error: args.error,
      activityLog: args.activityLog,
    });

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
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (isProjectInterviewing(project)) return null;

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

    await trackProjectInterviewWorkflow(ctx, args.projectId, workflowId);

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
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );
    if (isProjectInterviewing(project)) return null;

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    await startSpecWorkflow(ctx, args.projectId, {
      featureDescription: args.featureDescription,
      userId: ctx.userId,
      installationId: repo.installationId,
    });

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
    const projectData = await step.runMutation(
      internal.projectInterviewWorkflow.ensureInterviewSession,
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

    let held: InterviewSandbox | undefined;
    try {
      held = await prepareInterviewSandbox(
        step,
        projectData,
        args.installationId,
      );

      await launchAgentStep(
        step,
        {
          sandboxId: held.sandboxId,
          entityId: args.projectId,
          prompt,
          userId: args.userId,
          completionMutation: "projectInterviewWorkflow:handleCompletion",
          entityIdField: "projectId",
          model: "sonnet",
          allowedTools: "Read,Glob,Grep",
          repoId: projectData.repoId,
          sessionPersistenceId: args.projectId,
        },
        interviewTurnOwner(projectData),
      );

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
    } finally {
      await releaseInterviewSandbox(step, projectData, held, undefined);
    }
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
        await ctx.db.patch(args.projectId, { phase: "finalized" });
        return null;
      }
    }

    const messages = updateLastConversationEntry(
      conversation,
      JSON.stringify({ error: true }),
      args.activityLog,
    );
    await setProjectConversation(ctx.db, args.projectId, messages);
    return null;
  },
});
