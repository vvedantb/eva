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
import { buildQuickTaskRetryDelayMs, TASK_CHAT_BUSY_ERROR } from "./recovery";
import { getTaskRunStreamingEntityId } from "./helpers";
import { prepareSandboxSteps } from "../_sandbox_runtime/prepareSandboxSteps";
import { formatDelayedPublishFailureError } from "../_sessions/resultTarget";
import {
  prepareLinkedRepoSteps,
  publishLinkedRepoSteps,
} from "../_sessions/linkedRepoSteps";
import { errorMessage } from "@vvedantb/server";

const PR_STEP_RETRY = {
  retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
};

type TaskRunSessionClaim = NonNullable<
  FunctionReturnType<typeof internal.sessions.claimSandboxForTaskRun>
>;

type PrEnrichmentData = FunctionReturnType<
  typeof internal.taskWorkflow.getPrEnrichmentData
>;

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
  ownedSessionId: v.id("sessions"),
  branchName: v.optional(v.string()),
  baseBranch: v.optional(v.string()),
  isFirstTaskOnBranch: v.boolean(),
  model: v.optional(aiModelValidator),
  providerAccountId: v.optional(v.id("userProviderAccounts")),
  credentialOwnerUserId: v.optional(v.id("users")),
  userId: v.id("users"),
  mode: v.optional(runModeValidator),
};

/** Main durable workflow that orchestrates sandbox setup, task execution, PR creation, and cleanup. */
export const taskExecutionWorkflow = workflow.define({
  args: {
    ...taskExecutionWorkflowArgs,
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
      sessionClaim = await step.runMutation(
        internal.sessions.claimSandboxForTaskRun,
        { sessionId: args.ownedSessionId, runId: args.runId },
      );
      if (sessionClaim === null) throw new Error(TASK_CHAT_BUSY_ERROR);
      keepTaskSandboxActiveAfterRun = sessionClaim.wasActive;
      const reusableSandboxId = sessionClaim.sandboxId;
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
        }));
      } catch (prepareError) {
        if (!sessionClaim.wasActive) {
          await step.runMutation(internal.sessions.sandboxError, {
            sessionId: args.ownedSessionId,
            error: errorMessage(prepareError),
            startAttempt: sessionClaim.attempt,
          });
        }
        throw prepareError;
      }
      await step.runMutation(internal.sessions.attachTaskRunSandbox, {
        sessionId: args.ownedSessionId,
        sandboxId,
        attempt: sessionClaim.attempt,
      });

      if (data.hasLinkedRepos) {
        await prepareLinkedRepoSteps(step, {
          sessionId: args.ownedSessionId,
          sandboxId,
          repoId: args.repoId,
        });
      }

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

      let completionPrError: string | null = null;
      if (finalSuccess && pushedCommits) {
        const createPrAsDraft = true;
        try {
          let changeRequests: PrEnrichmentData["changeRequests"] = [];
          let relatedPrs: PrEnrichmentData["relatedPrs"] = [];
          try {
            const enrichment = await step.runQuery(
              internal.taskWorkflow.getPrEnrichmentData,
              { taskId: args.taskId },
            );
            changeRequests = enrichment.changeRequests;
            relatedPrs = enrichment.relatedPrs;
          } catch (enrichmentError) {
            console.error(
              `[task-workflow] run=${args.runId} PR enrichment failed; creating PR with base body: ${errorMessage(enrichmentError)}`,
            );
          }

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
            relatedPrs,
            draft: createPrAsDraft,
          };
          if (args.isFirstTaskOnBranch) {
            completionPrUrl = await step.runAction(
              internal.taskWorkflowActions.createTaskPullRequest,
              createPrArgs,
              PR_STEP_RETRY,
            );
          } else {
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
                  relatedPrs,
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

      if (result.success && sandboxId && data.hasLinkedRepos) {
        await publishLinkedRepoSteps(step, {
          sessionId: args.ownedSessionId,
          sandboxId,
          repoId: args.repoId,
          alert: { sessionId: args.ownedSessionId },
        });
      }

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

      if (!outcome.success) {
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
            "Failed to schedule task auto-retry:",
            retryError,
          );
        }
      }

      if (sandboxId && !preserveSandboxOnFailure) {
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
