import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internal } from "../_generated/api";
import { workflow } from "../workflowManager";
import {
  aiModelValidator,
  DEFAULT_AI_MODEL,
  runModeValidator,
} from "../validators";
import { taskCompleteEvent } from "./events";
import {
  buildQuickTaskRetryDelayMs,
  TASK_CHAT_BUSY_ERROR,
  TASK_CHAT_BUSY_RETRY_MS,
} from "./recovery";

/** How many times a project run waits out a busy session before it fails. */
const PROJECT_CLAIM_MAX_WAITS = 10;
import { getTaskRunStreamingEntityId } from "./helpers";
import { prepareSandboxSteps } from "../_sandbox_runtime/prepareSandboxSteps";
import { formatDelayedPublishFailureError } from "../_sessions/resultTarget";
import { errorMessage } from "@vvedantb/server";

const PR_STEP_RETRY = {
  retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
};

/** A quick task run's claim on its session's sandbox. */
type TaskRunSessionClaim = NonNullable<
  FunctionReturnType<typeof internal.sessions.claimSandboxForTaskRun>
>;

type PrEnrichmentData = FunctionReturnType<
  typeof internal.taskWorkflow.getPrEnrichmentData
>;

/** The terminal fields `completeRun` records for a run. */
type RunOutcome = {
  success: boolean;
  error: string | null;
  prError: string | null;
  prUrl: string | null;
  activityLog: string | null;
  exitReason?: string;
  claudeResult?: string;
};

/** Arguments every start passes; `startTaskRunWorkflow` adds `turnId`. */
export const taskExecutionWorkflowArgs = {
  runId: v.id("agentRuns"),
  taskId: v.id("agentTasks"),
  repoId: v.id("githubRepos"),
  installationId: v.number(),
  projectId: v.optional(v.id("projects")),
  /**
   * The session the run works on (a quick task's own, a project task's
   * project's): the run claims and attaches its sandbox there.
   */
  ownedSessionId: v.id("sessions"),
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

/** Main durable workflow that orchestrates sandbox setup, task execution, PR creation, and cleanup. */
export const taskExecutionWorkflow = workflow.define({
  args: {
    ...taskExecutionWorkflowArgs,
    /** The run's durable turn, opened by `startTaskRunWorkflow`. */
    turnId: v.id("turns"),
  },
  handler: async (step, args): Promise<void> => {
    let sandboxId: string | undefined;
    let completionPrUrl: string | null = null;
    let outcome: RunOutcome | undefined;
    let runFinalized = false;
    let preserveSandboxOnFailure = false;
    let keepTaskSandboxActiveAfterRun = false;
    let sessionClaim: TaskRunSessionClaim | null = null;

    // Outside the try: a run that is no longer queued (cancelled first) has
    // nothing to finalize, and its cancel path already released the task slot
    // and turn. Running the tail would clear a newer run's workflow id.
    const startResult = await step.runMutation(
      internal.taskWorkflow.updateRunToRunning,
      { runId: args.runId, taskId: args.taskId, repoId: args.repoId },
    );
    if (startResult === "not_queued") return;

    try {
      const data = await step.runQuery(internal.taskWorkflow.getTaskData, {
        taskId: args.taskId,
        repoId: args.repoId,
        runId: args.runId,
        projectId: args.projectId,
        branchName: args.branchName,
        mode: args.mode,
        ownedSessionId: args.ownedSessionId,
      });
      // A quick task's session lends its sandbox through the session
      // lifecycle: claimed (`closed` → `starting`, or reused while `active`)
      // before the VM is touched, so the row never reads `closed` over a
      // running VM. A start or stop in flight refuses the claim: the run
      // fails with the busy error and retries shortly (one busy rule with
      // `startTaskRun`), so it never boots a VM no session row records.
      sessionClaim = await step.runMutation(
        internal.sessions.claimSandboxForTaskRun,
        { sessionId: args.ownedSessionId, runId: args.runId },
      );
      // A project run waits out a start or stop in flight on its project's
      // session (a build must not fail on the reviewer's Start); a quick
      // task's run fails with the busy error and retries.
      for (
        let wait = 0;
        sessionClaim === null &&
        args.projectId !== undefined &&
        wait < PROJECT_CLAIM_MAX_WAITS;
        wait++
      ) {
        sessionClaim = await step.runMutation(
          internal.sessions.claimSandboxForTaskRun,
          { sessionId: args.ownedSessionId, runId: args.runId },
          { runAfter: TASK_CHAT_BUSY_RETRY_MS },
        );
      }
      if (sessionClaim === null) throw new Error(TASK_CHAT_BUSY_ERROR);
      // A project's VM stays up (`active`) after a run, as the project
      // sandbox always did: the build's next task and the chat resume it,
      // and idle pause stops it once nothing holds the session.
      keepTaskSandboxActiveAfterRun =
        args.projectId !== undefined || sessionClaim.wasActive;
      const reusableSandboxId = sessionClaim.sandboxId;
      const skipStartupCommands =
        args.projectId !== undefined &&
        reusableSandboxId !== undefined &&
        !args.isFirstTaskOnBranch;
      try {
        ({ sandboxId } = await prepareSandboxSteps(step, {
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
        }));
      } catch (prepareError) {
        // The claimed start failed: the normal start-failure transition
        // (`starting` → `closed`, fenced by the claim's attempt).
        if (!sessionClaim.wasActive) {
          await step.runMutation(internal.sessions.sandboxError, {
            sessionId: args.ownedSessionId,
            error: errorMessage(prepareError),
            startAttempt: sessionClaim.attempt,
          });
        }
        throw prepareError;
      }
      // `starting` → `active` with this VM: chat, preview and sweeps all
      // read it there. Refused if a stop or newer start won meanwhile; the
      // tail then stops this VM as the run's own.
      await step.runMutation(internal.sessions.attachTaskRunSandbox, {
        sessionId: args.ownedSessionId,
        sandboxId,
        attempt: sessionClaim.attempt,
      });

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

      const result = await step.awaitEvent(taskCompleteEvent);
      let finalSuccess = result.success;
      let finalError = result.error;

      console.log(
        `[task-workflow] run=${args.runId} taskId=${args.taskId} projectId=${args.projectId ?? "none"} agentSuccess=${finalSuccess} isFirstTaskOnBranch=${args.isFirstTaskOnBranch} branchName=${data.branchName} baseBranch=${args.baseBranch ?? "(default)"}`,
      );

      let pushedCommits = false;
      if (finalSuccess && sandboxId) {
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
          pushedCommits = pushResult.pushed;
        } catch (error) {
          preserveSandboxOnFailure = true;
          finalSuccess = false;
          finalError = formatDelayedPublishFailureError("task", error);
          console.error(
            `[task-workflow] run=${args.runId} pushSandboxBranch failed: ${errorMessage(error)}`,
          );
        }
      }

      if (finalSuccess) {
        try {
          await step.runMutation(
            internal.taskWorkflow.scheduleDeploymentTracking,
            {
              runId: args.runId,
              installationId: args.installationId,
              repoOwner: data.repoOwner,
              repoName: data.repoName,
              repoId: args.repoId,
              branchName: data.branchName,
              deploymentProjectName: data.deploymentProjectName,
            },
          );
        } catch (deploymentError) {
          console.error(
            `[task-workflow] run=${args.runId} deployment tracking scheduling failed: ${errorMessage(deploymentError)}`,
          );
        }
      }

      // PR create/refresh only when this run actually pushed commits: a run
      // that published nothing has no diff to open or refresh a PR for, and
      // attempting one against a branch origin may not even have burned
      // compare retries into a spurious "PR creation failed" (404). Transient
      // failures still recover via the next pushing run or the Create PR button.
      let completionPrError: string | null = null;
      if (finalSuccess && pushedCommits) {
        const createPrAsDraft = true;
        try {
          let changeRequests: PrEnrichmentData["changeRequests"] = [];
          try {
            const enrichment = await step.runQuery(
              internal.taskWorkflow.getPrEnrichmentData,
              { taskId: args.taskId },
            );
            changeRequests = enrichment.changeRequests;
          } catch (enrichmentError) {
            console.error(
              `[task-workflow] run=${args.runId} PR enrichment failed; creating PR with base body: ${errorMessage(enrichmentError)}`,
            );
          }

          // Wrap PR creation/refresh in try/catch so a GitHub failure (closed PR
          // already exists, base branch missing, transient API error after retries)
          // does not bubble to the outer catch — which would silently flip the run
          // back to success: true with a null prUrl and no error, hiding the
          // failure from the user. Commits are already pushed; the manual
          // "Create PR" button is the recovery path.
          console.log(
            `[task-workflow] run=${args.runId} entering PR step path=${args.isFirstTaskOnBranch ? "create" : "refresh"}`,
          );
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
            completionPrUrl = await step.runAction(
              internal.taskWorkflowActions.createTaskPullRequest,
              createPrArgs,
              PR_STEP_RETRY,
            );
          } else {
            // Subsequent runs: try to update the existing open PR body first.
            // If the previous PR was merged/closed, fall back to creating a
            // fresh PR so change-request runs still get a PR auto-created.
            try {
              completionPrUrl = await step.runAction(
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
              completionPrUrl = await step.runAction(
                internal.taskWorkflowActions.createTaskPullRequest,
                createPrArgs,
                PR_STEP_RETRY,
              );
            }
          }
        } catch (prError) {
          const action = args.isFirstTaskOnBranch ? "creation" : "refresh";
          completionPrError = `PR ${action} failed: ${errorMessage(prError)}. Commits are pushed; use the Create PR button to recover.`;
          console.error(
            `PR ${action} failed for run ${args.runId}: ${completionPrError}`,
          );
        }
      }

      // Surface a PR-step failure to the user even though the run is otherwise
      // successful — the commits are already on GitHub, so we keep success: true
      // (no auto-retry, no sandbox-preserve), but record the error in the
      // dedicated prError field so the UI can show what went wrong instead of
      // silently dropping it (the run-level `error` field is cleared on success
      // runs by finalizeRunStatus).
      outcome = {
        success: finalSuccess,
        error: finalError,
        prError: completionPrError,
        prUrl: completionPrUrl,
        activityLog: result.activityLog,
        claudeResult: result.result ?? undefined,
      };
      await step.runMutation(internal.taskWorkflow.completeRun, {
        runId: args.runId,
        taskId: args.taskId,
        projectId: args.projectId,
        mode: args.mode,
        ...outcome,
      });
      runFinalized = true;

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
            `[task-workflow] run=${args.runId} generatePrDescription failed: ${errorMessage(descriptionError)}`,
          );
        }
      }
    } catch (error) {
      outcome = outcome ?? {
        success: false,
        error: error instanceof Error ? error.message : "Task workflow failed",
        prError: null,
        prUrl: null,
        activityLog: null,
        exitReason: "error",
      };
    }

    // One terminal tail for both paths: finalize the run if the try did not,
    // retry a failed quick task, then stop its sandbox when that is safe.
    try {
      if (!runFinalized) {
        await step.runMutation(internal.taskWorkflow.completeRun, {
          runId: args.runId,
          taskId: args.taskId,
          projectId: args.projectId,
          mode: args.mode,
          ...outcome,
        });
      }

      if (!args.projectId && !outcome.success) {
        try {
          await step.runMutation(
            internal.taskWorkflow.maybeScheduleQuickTaskRetry,
            {
              taskId: args.taskId,
              runId: args.runId,
              error: outcome.error ?? undefined,
              delayMs: buildQuickTaskRetryDelayMs(),
            },
          );
        } catch (retryError) {
          console.error(
            "Failed to schedule quick-task auto-retry:",
            retryError,
          );
        }
      }

      // Stop (don't delete) quick-task sandboxes that were not already open in
      // the reviewer UI. If a change-request reused an active preview sandbox,
      // keep it active so "View Sandbox" continues pointing at a live sandbox.
      if (sandboxId && !preserveSandboxOnFailure) {
        // `active` → `stopping` → `closed` through the session stop path,
        // unless the reviewer had it open when the run began (it stays
        // `active` and idle pause stops it later). Mirrors
        // `keepTaskSandboxActiveAfterRun` for the task sandbox.
        try {
          await step.runMutation(
            internal.sessions.finishTaskRunSandboxMutation,
            {
              sessionId: args.ownedSessionId,
              sandboxId,
              keepActive: keepTaskSandboxActiveAfterRun,
            },
          );
        } catch {}
      }
    } finally {
      await step.runMutation(internal.taskWorkflow.clearActiveWorkflow, {
        taskId: args.taskId,
        runId: args.runId,
      });
      await step.runMutation(internal.taskWorkflow.closeRunTurn, {
        runId: args.runId,
        success: outcome.success,
      });
    }
  },
});
