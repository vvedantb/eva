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
      skipStartupCommands?: boolean;
    }
  | { kind: "reuse"; sandboxId: string | undefined };

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
  | "providerAccountId"
>;

type RunOneShotAgentSpec = {
  ownerId: AgentJobOwnerId;
  userId: Id<"users">;
  installationId: number;
  repo: { id: Id<"githubRepos">; owner: string; name: string };
  sandbox: AgentJobSandbox;
  streamingEntityId?: string;
  agent: AgentJobAgent;
  prompt: string | ((sandboxId: string) => Promise<string>);
  onSandboxReady?: (sandboxId: string) => Promise<void>;
  onResult: (result: AgentJobResult, sandboxId: string) => Promise<void>;
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
