import type { WorkflowCtx } from "@convex-dev/workflow";
import type { FunctionArgs } from "convex/server";
import { errorMessage } from "@vvedantb/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { prepareSandboxSteps } from "../_sandbox_runtime/prepareSandboxSteps";
import { agentJobCompleteEvent, type AgentJobResult } from "./completion";
import type { AgentJobOwnerId } from "./owner";

type LaunchArgs = FunctionArgs<typeof internal.sandbox.launchAgentTurn>;

/**
 * Where the agent runs. An ephemeral sandbox is created for the job and
 * deleted when it ends. `reuse` resumes the owner's own sandbox (or creates
 * one when it has none) and leaves it running.
 */
export type AgentJobSandbox =
  | {
      kind: "ephemeral";
      baseBranch?: string;
      branchName?: string;
      createRetry?: {
        maxAttempts: number;
        initialBackoffMs: number;
        base: number;
      };
      /** Skip repo startup and background commands (agents that only read). */
      skipStartupCommands?: boolean;
    }
  | { kind: "reuse"; sandboxId: string | undefined };

/** Launch settings the job picks; the primitive fills in the rest. */
type AgentJobAgent = Pick<
  LaunchArgs,
  | "model"
  | "allowedTools"
  | "reasoningLevel"
  | "thinkingEnabled"
  | "use1mContext"
  | "fastMode"
  | "runId"
  | "requireTaskCommit"
>;

type RunOneShotAgentSpec = {
  /** The row that holds the job's slot and owns its turn. */
  ownerId: AgentJobOwnerId;
  userId: Id<"users">;
  installationId: number;
  /** `id` is the row whose sandbox credentials the job uses. */
  repo: { id: Id<"githubRepos">; owner: string; name: string };
  sandbox: AgentJobSandbox;
  /** Defaults to the owner id. */
  streamingEntityId?: string;
  agent: AgentJobAgent;
  /** A function when the prompt needs the prepared sandbox (a port, say). */
  prompt: string | ((sandboxId: string) => Promise<string>);
  /** Runs once the sandbox is ready, before the agent launches. */
  onSandboxReady?: (sandboxId: string) => Promise<void>;
  /** Saves the agent's result. Runs before the sandbox is deleted. */
  onResult: (result: AgentJobResult, sandboxId: string) => Promise<void>;
  /** Saves a failure of any step: prepare, launch or `onResult`. */
  onError: (message: string) => Promise<void>;
};

/**
 * Runs one one-shot agent inside a workflow: prepares the sandbox, launches
 * the agent under its own durable turn, waits for `agentJobComplete`, then
 * hands the result to the job. Any failure goes to `onError`. The ephemeral
 * sandbox and the streaming row are cleaned up in `finally`.
 *
 * The callback posts to `agentJobs:handleCompletion`, which settles the turn
 * and sends the event to the turn's workflow.
 */
export async function runOneShotAgent(
  step: WorkflowCtx,
  spec: RunOneShotAgentSpec,
): Promise<void> {
  const streamingEntityId = spec.streamingEntityId ?? String(spec.ownerId);
  const ephemeral = spec.sandbox.kind === "ephemeral";
  let sandboxId: string | undefined;
  try {
    ({ sandboxId } = await prepareSandboxSteps(step, {
      installationId: spec.installationId,
      repoOwner: spec.repo.owner,
      repoName: spec.repo.name,
      repoId: spec.repo.id,
      streamingEntityId,
      ...(spec.sandbox.kind === "ephemeral"
        ? {
            ephemeral: true,
            baseBranch: spec.sandbox.baseBranch,
            branchName: spec.sandbox.branchName,
            createRetry: spec.sandbox.createRetry,
            skipStartupCommands: spec.sandbox.skipStartupCommands,
          }
        : { ephemeral: false, existingSandboxId: spec.sandbox.sandboxId }),
    }));
    await spec.onSandboxReady?.(sandboxId);
    const prompt =
      typeof spec.prompt === "string"
        ? spec.prompt
        : await spec.prompt(sandboxId);

    await step.runAction(internal.sandbox.launchAgentTurn, {
      ...spec.agent,
      sandboxId,
      entityId: String(spec.ownerId),
      entityIdField: "entityId",
      completionMutation: "agentJobs:handleCompletion",
      streamingEntityId,
      prompt,
      userId: spec.userId,
      repoId: spec.repo.id,
      turnEntityId: spec.ownerId,
      workflowId: step.workflowId,
    });

    const result = await step.awaitEvent(agentJobCompleteEvent);
    await spec.onResult(result, sandboxId);
  } catch (error) {
    await spec.onError(errorMessage(error));
  } finally {
    if (ephemeral && sandboxId) {
      // Best-effort: a failed delete must not fail the job.
      try {
        await step.runAction(internal.sandbox.deleteSandbox, {
          sandboxId,
          repoId: spec.repo.id,
        });
      } catch (cleanupError) {
        console.error(
          `[agentJobs] failed to delete sandbox ${sandboxId}:`,
          cleanupError,
        );
      }
    }
    await step.runMutation(internal.agentJobs.clearStreaming, {
      streamingEntityId,
    });
  }
}
