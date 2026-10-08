import type { WorkflowCtx } from "@convex-dev/workflow";
import type { FunctionArgs } from "convex/server";
import { internal } from "../_generated/api";
import type { TurnEntityId } from "../_chat/turnStore";
import type { TurnLane } from "../validators";

type LaunchArgs = FunctionArgs<typeof internal.sandbox.launchAgentTurn>;

/**
 * Launches a one-shot agent from its workflow under its own durable turn
 * (`launchAgentTurn`), bound to the calling workflow.
 */
export async function launchAgentStep(
  step: WorkflowCtx,
  launch: Omit<LaunchArgs, "turnEntityId" | "turnLane" | "workflowId">,
  owner: { entityId: TurnEntityId; lane?: TurnLane },
): Promise<void> {
  await step.runAction(internal.sandbox.launchAgentTurn, {
    ...launch,
    turnEntityId: owner.entityId,
    turnLane: owner.lane,
    workflowId: step.workflowId,
  });
}
