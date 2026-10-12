import { v, type ObjectType } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import {
  aiModelValidator,
  DEFAULT_AI_MODEL,
  runModeValidator,
} from "../validators";
import { taskCompleteEvent } from "./events";
import { buildQuickTaskRetryDelayMs } from "./recovery";
import { getTaskRunStreamingEntityId } from "./helpers";
import { prepareSandboxSteps } from "../_sandbox_runtime/prepareSandboxSteps";
import { formatDelayedPublishFailureError } from "../_sessions/resultTarget";

const PR_STEP_RETRY = {
  retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
};

type PrEnrichmentData = FunctionReturnType<
  typeof internal.taskWorkflow.getPrEnrichmentData
>;

/** Arguments every start passes; `startTaskRunWorkflow` adds `turnId`. */
export const taskExecutionWorkflowArgs = {
  runId: v.id("agentRuns"),
  taskId: v.id("agentTasks"),
  repoId: v.id("githubRepos"),
  installationId: v.number(),
  projectId: v.optional(v.id("projects")),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  isFirstTaskOnBranch: v.boolean(),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  /** Entity owner for personal-credential decrypt (task.createdBy). */
  credentialOwnerUserId: v.optional(v.id("users")),
  userId: v.id("users"),
  mode: v.optional(runModeValidator),
};

type TaskExecutionWorkflowArgs = ObjectType<typeof taskExecutionWorkflowArgs> & {
  turnId: Id<"turns">;
};

type TaskData = FunctionReturnType<typeof internal.taskWorkflow.getTaskData>;

/**
 * Mutable run state shared by the happy path and the failure path. The catch
 * branch reads whatever the happy path had recorded when it threw.
 */
type TaskRunState = {
  sandboxId: string | undefined;
  completionSuccess: boolean | undefined;
  completionError: string | null;
  completionPrUrl: string | null;
  completionPrError: string | null;
  completionActivityLog: string | null;
  completionResult: string | null;
  finalSuccess: boolean;
  finalError: string | null;
  runCompletionRecorded: boolean;
  runFinalized: boolean;
  sandboxStopped: boolean;
  preserveSandboxOnFailure: boolean;
  keepTaskSandboxActiveAfterRun: boolean;
};

/** Main durable workflow that orchestrates sandbox setup, task execution, PR creation, and cleanup. */
export const taskExecutionWorkflow = workflow.define({
  args: {
    ...taskExecutionWorkflowArgs,
    /** The run's durable turn, opened by `startTaskRunWorkflow`. */
    turnId: v.id("turns"),
  },
  handler: async (step, args): Promise<void> => {
    const state: TaskRunState = {
      sandboxId: undefined,
      completionSuccess: undefined,
      completionError: null,
      completionPrUrl: null,
      completionPrError: null,
      completionActivityLog: null,
      completionResult: null,
      finalSuccess: false,
      finalError: null,
      runCompletionRecorded: false,
      runFinalized: false,
      sandboxStopped: false,
      preserveSandboxOnFailure: false,
      keepTaskSandboxActiveAfterRun: false,
    };

    try {
      await runTaskExecution(step, args, state);
    } catch (error) {
      const workflowError =
        error instanceof Error ? error.message : "Task workflow failed";
      await recoverFailedTaskRun(step, args, state, workflowError);
    } finally {
      await step.runMutation(internal.taskWorkflow.clearActiveWorkflow, {
        taskId: args.taskId,
      });
      await step.runMutation(internal.taskWorkflow.closeRunTurn, {
        runId: args.runId,
        success: state.finalSuccess,
      });
    }
  },
});

/** Happy path: launch, wait for the agent, publish, record, clean up. */
async function runTaskExecution(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  state: TaskRunState,
): Promise<void> {
  const data = await launchTaskRun(step, args, state);

  const result = await step.awaitEvent(taskCompleteEvent);
  state.completionSuccess = result.success;
  state.completionError = result.error;
  state.completionActivityLog = result.activityLog;
  state.completionResult = result.result;
  state.finalSuccess = result.success;
  state.finalError = result.error;

  console.log(
    `[task-workflow] run=${args.runId} taskId=${args.taskId} projectId=${args.projectId ?? "none"} agentSuccess=${state.finalSuccess} isFirstTaskOnBranch=${args.isFirstTaskOnBranch} branchName=${data.branchName} baseBranch=${args.baseBranch ?? "(default)"}`,
  );

  const pushedCommits = await pushTaskBranch(step, args, data, state);

  if (state.finalSuccess) {
    await scheduleTaskDeploymentTracking(step, args, data);
  }

  // PR create/refresh only when this run actually pushed commits: a run
  // that published nothing has no diff to open or refresh a PR for, and
  // attempting one against a branch origin may not even have burned
  // compare retries into a spurious "PR creation failed" (404). Transient
  // failures still recover via the next pushing run or the Create PR button.
  if (state.finalSuccess && pushedCommits) {
    await publishTaskPullRequest(step, args, data, state);
  }

  await recordRunCompletion(step, args, state, result);
  await runPostCompletionSteps(step, args, data, state);
}

/** Marks the run running, prepares the sandbox, launches the agent, persists the sandbox id. */
async function launchTaskRun(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  state: TaskRunState,
): Promise<TaskData> {
  await step.runMutation(internal.taskWorkflow.updateRunToRunning, {
    runId: args.runId,
    taskId: args.taskId,
    repoId: args.repoId,
  });

  const data = await step.runQuery(internal.taskWorkflow.getTaskData, {
    taskId: args.taskId,
    repoId: args.repoId,
    runId: args.runId,
    projectId: args.projectId,
    branchName: args.branchName,
    mode: args.mode,
  });
  state.keepTaskSandboxActiveAfterRun = data.keepTaskSandboxActiveAfterRun;
  // Reuse the persisted sandbox for project tasks (project.sandboxId) or
  // for quick tasks on follow-up runs (task.sandboxId — set after the first
  // run completes). Quick-task sandboxes are persistent (stop/pause, not
  // delete-on-completion — see "Persistent Quick-Task Sandboxes" in the
  // changelog), so `ephemeral` is always false: a first run that ended up
  // ephemeral would be deleted on auto-stop, leaving
  // `task.sandboxId` as a tombstone and breaking the reviewer preview.
  const reusableSandboxId =
    data.projectSandboxId ?? data.taskSandboxId ?? undefined;
  const skipStartupCommands =
    args.projectId !== undefined &&
    reusableSandboxId !== undefined &&
    !args.isFirstTaskOnBranch;
  const { sandboxId } = await prepareSandboxSteps(step, {
    existingSandboxId: reusableSandboxId,
    installationId: args.installationId,
    repoOwner: data.repoOwner,
    repoName: data.repoName,
    ephemeral: false,
    repoId: args.repoId,
    attachRunId: args.runId,
    streamingEntityId: getTaskRunStreamingEntityId(args.runId),
    baseBranch: args.baseBranch,
    branchName: data.branchName,
    createRetry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
    skipStartupCommands,
    sessionPersistenceId: args.projectId,
    sessionPersistenceKind: args.projectId ? "projects" : undefined,
  });
  state.sandboxId = sandboxId;

  await step.runMutation(internal.turns.markLaunching, {
    turnId: args.turnId,
    sandboxId,
  });
  const turnLease = await step.runMutation(
    internal.turns.acquireOneShotLease,
    { turnId: args.turnId, sandboxId },
  );
  if (turnLease === null) {
    throw new Error("The run's turn closed before the agent launched");
  }

  await step.runAction(internal.sandbox.launchOnExistingSandbox, {
    sandboxId,
    entityId: String(args.taskId),
    prompt: data.prompt,
    userId: args.userId,
    completionMutation: "taskWorkflow:handleCompletion",
    entityIdField: "taskId",
    model: args.model ?? DEFAULT_AI_MODEL,
    // Traits come off the task doc for the same reason as attachments
    // below: every entry point then honours the user's picks.
    reasoningLevel: data.traits.reasoningLevel,
    thinkingEnabled: data.traits.thinkingEnabled,
    use1mContext: data.traits.use1mContext,
    fastMode: data.traits.fastMode,
    allowedTools: "Read,Write,Edit,Bash,Glob,Grep",
    repoId: args.repoId,
    streamingEntityId: getTaskRunStreamingEntityId(args.runId),
    runId: String(args.runId),
    requireTaskCommit: true,
    providerAccountId: args.providerAccountId,
    credentialOwnerUserId: args.credentialOwnerUserId,
    // Read off the task doc rather than the workflow args so every entry
    // point (quick run, queued, scheduled, project build, auto-run from
    // findings) delivers the user's attachments without extra plumbing.
    attachmentStorageIds: data.attachmentStorageIds,
    turnId: turnLease.turnId,
    turnLeaseGeneration: turnLease.leaseGeneration,
  });

  await step.runMutation(internal.taskWorkflow.saveSandboxId, {
    runId: args.runId,
    sandboxId,
  });

  if (args.projectId) {
    await step.runMutation(internal.taskWorkflow.updateProjectSandbox, {
      projectId: args.projectId,
      sandboxId,
    });
  } else {
    // Quick tasks: persist sandbox on the task itself so reviewer Start
    // Sandbox and follow-up runs (resolve_conflicts, change-requests)
    // resume the same paused filesystem instead of bootstrapping anew.
    await step.runMutation(internal.taskWorkflow.saveTaskSandboxId, {
      taskId: args.taskId,
      sandboxId,
    });
  }
  return data;
}

/** Pushes the run's branch. A push failure fails the run and keeps the sandbox. */
async function pushTaskBranch(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  data: TaskData,
  state: TaskRunState,
): Promise<boolean> {
  const sandboxId = state.sandboxId;
  if (!state.finalSuccess || !sandboxId) return false;
  try {
    const pushResult = await step.runAction(
      internal.sandbox.pushSandboxBranch,
      {
        sandboxId,
        installationId: args.installationId,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        repoId: args.repoId,
        branchName: data.branchName,
      },
    );
    return pushResult.pushed;
  } catch (error) {
    state.preserveSandboxOnFailure = true;
    state.finalSuccess = false;
    state.finalError = formatDelayedPublishFailureError("task", error);
    console.error(
      `[task-workflow] run=${args.runId} pushSandboxBranch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** Best-effort: schedules deployment tracking for the pushed branch. */
async function scheduleTaskDeploymentTracking(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  data: TaskData,
): Promise<void> {
  try {
    await step.runMutation(internal.taskWorkflow.scheduleDeploymentTracking, {
      runId: args.runId,
      installationId: args.installationId,
      repoOwner: data.repoOwner,
      repoName: data.repoName,
      repoId: args.repoId,
      branchName: data.branchName,
      deploymentProjectName: data.deploymentProjectName,
    });
  } catch (deploymentError) {
    console.error(
      `[task-workflow] run=${args.runId} deployment tracking scheduling failed: ${deploymentError instanceof Error ? deploymentError.message : String(deploymentError)}`,
    );
  }
}

/** Creates or refreshes the task PR. Records a PR failure without failing the run. */
async function publishTaskPullRequest(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  data: TaskData,
  state: TaskRunState,
): Promise<void> {
  try {
    const changeRequests = await fetchPrChangeRequests(step, args);
    // Wrap PR creation/refresh in try/catch so a GitHub failure (closed PR
    // already exists, base branch missing, transient API error after retries)
    // does not bubble to the outer catch — which would silently flip the run
    // back to success: true with a null prUrl and no error, hiding the
    // failure from the user. Commits are already pushed; the manual
    // "Create PR" button is the recovery path.
    console.log(
      `[task-workflow] run=${args.runId} entering PR step path=${args.isFirstTaskOnBranch ? "create" : "refresh"}`,
    );
    state.completionPrUrl = await createOrRefreshTaskPullRequest(
      step,
      args,
      data,
      changeRequests,
    );
  } catch (prError) {
    const action = args.isFirstTaskOnBranch ? "creation" : "refresh";
    state.completionPrError = `PR ${action} failed: ${prError instanceof Error ? prError.message : String(prError)}. Commits are pushed; use the Create PR button to recover.`;
    console.error(
      `PR ${action} failed for run ${args.runId}: ${state.completionPrError}`,
    );
  }
}

/** Best-effort: change requests for the PR body; empty on failure. */
async function fetchPrChangeRequests(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
): Promise<PrEnrichmentData["changeRequests"]> {
  let changeRequests: PrEnrichmentData["changeRequests"] = [];
  try {
    const enrichment = await step.runQuery(
      internal.taskWorkflow.getPrEnrichmentData,
      { taskId: args.taskId },
    );
    changeRequests = enrichment.changeRequests;
  } catch (enrichmentError) {
    console.error(
      `[task-workflow] run=${args.runId} PR enrichment failed; creating PR with base body: ${enrichmentError instanceof Error ? enrichmentError.message : String(enrichmentError)}`,
    );
  }
  return changeRequests;
}

/** First run on a branch creates the PR; later runs refresh it, else create. */
async function createOrRefreshTaskPullRequest(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  data: TaskData,
  changeRequests: PrEnrichmentData["changeRequests"],
): Promise<string | null> {
  const createPrAsDraft = true;
  const createPrArgs = {
    installationId: args.installationId,
    repoOwner: data.repoOwner,
    repoName: data.repoName,
    branchName: data.branchName,
    baseBranch: args.baseBranch,
    title: data.taskTitle,
    taskId: args.taskId,
    projectId: args.projectId,
    taskDescription: data.taskDescription,
    rootDirectory: data.rootDirectory,
    changeRequests,
    draft: createPrAsDraft,
  };
  if (args.isFirstTaskOnBranch) {
    // Quick tasks land in business_review on completion; the PR should
    // mirror that by opening as draft. The user promotes it to ready
    // when they move the task to code_review.
    return await step.runAction(
      internal.taskWorkflowActions.createTaskPullRequest,
      createPrArgs,
      PR_STEP_RETRY,
    );
  }
  // Subsequent runs: try to update the existing open PR body first.
  // If the previous PR was merged/closed, fall back to creating a
  // fresh PR so change-request runs still get a PR auto-created.
  try {
    return await step.runAction(
      internal.taskWorkflowActions.refreshTaskPullRequestBody,
      {
        installationId: args.installationId,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        branchName: data.branchName,
        taskId: args.taskId,
        projectId: args.projectId,
        taskDescription: data.taskDescription,
        rootDirectory: data.rootDirectory,
        changeRequests,
      },
      PR_STEP_RETRY,
    );
  } catch {
    console.log(
      `[task-workflow] run=${args.runId} PR refresh failed (PR likely merged/closed), falling back to create`,
    );
    return await step.runAction(
      internal.taskWorkflowActions.createTaskPullRequest,
      createPrArgs,
      PR_STEP_RETRY,
    );
  }
}

/** Records the run's outcome: streaming phase first, then the run itself. */
async function recordRunCompletion(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  state: TaskRunState,
  result: { activityLog: string | null; result: string | null },
): Promise<void> {
  // Surface a PR-step failure to the user even though the run is otherwise
  // successful — the commits are already on GitHub, so we keep success: true
  // (no auto-retry, no sandbox-preserve), but record the error in the
  // dedicated prError field so the UI can show what went wrong instead of
  // silently dropping it (the run-level `error` field is cleared on success
  // runs by finalizeRunStatus).
  await step.runMutation(internal.taskWorkflow.finalizeRunStreamingPhase, {
    runId: args.runId,
    taskId: args.taskId,
    projectId: args.projectId,
    success: state.finalSuccess,
    error: state.finalError,
    prError: state.completionPrError,
    prUrl: state.completionPrUrl,
    activityLog: result.activityLog,
    claudeResult: result.result ?? undefined,
  });
  state.runCompletionRecorded = true;

  await step.runMutation(internal.taskWorkflow.completeRun, {
    runId: args.runId,
    taskId: args.taskId,
    projectId: args.projectId,
    success: state.finalSuccess,
    error: state.finalError,
    prError: state.completionPrError,
    prUrl: state.completionPrUrl,
    activityLog: result.activityLog,
    mode: args.mode,
    claudeResult: result.result ?? undefined,
  });
  state.runFinalized = true;
}

/** PR description (project tasks), quick-task retry, and quick-task sandbox stop. */
async function runPostCompletionSteps(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  data: TaskData,
  state: TaskRunState,
): Promise<void> {
  const { sandboxId, completionPrUrl } = state;
  // Project tasks only. A quick task lands in business_review here, so its
  // diff is not final yet — its description is written when the reviewer
  // moves the task to code_review (`agentTasks.updateStatus`), the same
  // point a session writes one on "Send for review". Project tasks share
  // one PR across many tasks and never make that transition, so they keep
  // writing it per run, on the still-running sandbox. Best-effort: the
  // static body stays if this fails.
  if (args.projectId && completionPrUrl && sandboxId) {
    try {
      await step.runAction(internal.github.generatePrDescription, {
        installationId: args.installationId,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        prUrl: completionPrUrl,
        sandboxId,
        repoId: args.repoId,
      });
    } catch (descriptionError) {
      console.error(
        `[task-workflow] run=${args.runId} generatePrDescription failed: ${descriptionError instanceof Error ? descriptionError.message : String(descriptionError)}`,
      );
    }
  }

  if (!args.projectId && !state.finalSuccess) {
    await scheduleQuickTaskRetry(step, args, state.finalError);
  }

  // Stop (don't delete) quick-task sandboxes that were not already open in
  // the reviewer UI. If a change-request reused an active preview sandbox,
  // keep it active so "View Sandbox" continues pointing at a live sandbox.
  if (
    !args.projectId &&
    sandboxId &&
    !state.preserveSandboxOnFailure &&
    !state.keepTaskSandboxActiveAfterRun
  ) {
    await stopQuickTaskSandbox(step, args, sandboxId);
    state.sandboxStopped = true;
  }
}

/** Failure path: record whatever the happy path did not, retry, stop the sandbox. */
async function recoverFailedTaskRun(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  state: TaskRunState,
  workflowError: string,
): Promise<void> {
  const fallbackSuccess = state.completionSuccess ?? false;
  const fallbackError = fallbackSuccess
    ? null
    : (state.completionError ?? workflowError);
  const fallbackExitReason = fallbackSuccess ? "completed" : "error";

  if (!state.runCompletionRecorded) {
    await step.runMutation(internal.taskWorkflow.finalizeRunStreamingPhase, {
      runId: args.runId,
      taskId: args.taskId,
      projectId: args.projectId,
      success: fallbackSuccess,
      error: fallbackError,
      prError: state.completionPrError,
      prUrl: state.completionPrUrl,
      activityLog: state.completionActivityLog,
      exitReason: fallbackExitReason,
      claudeResult: state.completionResult ?? undefined,
    });
  }

  if (!state.runFinalized) {
    await step.runMutation(internal.taskWorkflow.completeRun, {
      runId: args.runId,
      taskId: args.taskId,
      projectId: args.projectId,
      success: fallbackSuccess,
      error: fallbackError,
      prError: state.completionPrError,
      prUrl: state.completionPrUrl,
      activityLog: state.completionActivityLog,
      exitReason: fallbackExitReason,
      mode: args.mode,
      claudeResult: state.completionResult ?? undefined,
    });
  }

  if (!args.projectId) {
    await scheduleQuickTaskRetry(step, args, fallbackError);
  }

  const sandboxId = state.sandboxId;
  if (
    !args.projectId &&
    sandboxId &&
    !state.sandboxStopped &&
    !state.preserveSandboxOnFailure &&
    !state.keepTaskSandboxActiveAfterRun
  ) {
    try {
      await stopQuickTaskSandbox(step, args, sandboxId);
    } catch {}
  }
}

/** Best-effort: schedules a quick-task auto-retry. */
async function scheduleQuickTaskRetry(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  error: string | null,
): Promise<void> {
  try {
    await step.runMutation(internal.taskWorkflow.maybeScheduleQuickTaskRetry, {
      taskId: args.taskId,
      runId: args.runId,
      error: error ?? undefined,
      delayMs: buildQuickTaskRetryDelayMs(),
    });
  } catch (retryError) {
    console.error("Failed to schedule quick-task auto-retry:", retryError);
  }
}

/** Stops (not deletes) a quick-task sandbox and marks the task's sandbox stopped. */
async function stopQuickTaskSandbox(
  step: WorkflowCtx,
  args: TaskExecutionWorkflowArgs,
  sandboxId: string,
): Promise<void> {
  await step.runAction(internal.sandbox.stopSandbox, {
    sandboxId,
    repoId: args.repoId,
  });
  await step.runMutation(internal.taskWorkflow.markTaskSandboxStopped, {
    taskId: args.taskId,
  });
}
