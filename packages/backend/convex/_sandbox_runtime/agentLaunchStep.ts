import type { WorkflowCtx } from "@convex-dev/workflow";
import type { FunctionArgs } from "convex/server";
import { internal } from "../_generated/api";
import type { TurnEntityId } from "../_chat/turnStore";
import type { TurnLane } from "../validators";

type LaunchArgs = FunctionArgs<typeof internal.sandbox.launchOnExistingSandbox>;

/** The durable turn a one-shot agent's launch opens. */
type AgentTurnOwner = {
  /** False for a workflow started before durable agent turns. */
  durable: boolean;
  entityId: TurnEntityId;
  lane?: TurnLane;
};

/**
 * Launches a one-shot agent from its workflow. A workflow started with
 * `durableTurns` launches under its own durable turn (`launchAgentTurn`); one
 * started before keeps the old step, so its journal still replays.
 */
export async function launchAgentStep(
  step: WorkflowCtx,
  launch: Omit<LaunchArgs, "turnId" | "turnLeaseGeneration">,
  owner: AgentTurnOwner,
): Promise<void> {
  if (!owner.durable) {
    await step.runAction(internal.sandbox.launchOnExistingSandbox, launch);
    return;
  }
  await step.runAction(internal.sandbox.launchAgentTurn, {
    ...launch,
    turnEntityId: owner.entityId,
    turnLane: owner.lane,
    workflowId: step.workflowId,
  });
}
