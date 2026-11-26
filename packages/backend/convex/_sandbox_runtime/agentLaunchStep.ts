import type { WorkflowCtx } from "@convex-dev/workflow";
import type { FunctionArgs } from "convex/server";
import { internal } from "../_generated/api";
import type { TurnEntityId } from "../_chat/turnStore";
import type { Id } from "../_generated/dataModel";

type LaunchArgs = FunctionArgs<typeof internal.sandbox.launchAgentTurn>;

/**
 * Launches a one-shot agent from its workflow under its own durable turn
 * (`launchAgentTurn`), bound to the calling workflow.
 */
export async function launchAgentStep(
  step: WorkflowCtx,
  launch: Omit<LaunchArgs, "turnEntityId" | "workflowId">,
  owner: {
    entityId: TurnEntityId;
    /** The session whose sandbox the agent holds: its open-turn reads see the turn. */
    sessionId?: Id<"sessions">;
  },
): Promise<void> {
  await step.runAction(internal.sandbox.launchAgentTurn, {
    ...launch,
    turnEntityId: owner.entityId,
    turnSessionId: owner.sessionId,
    workflowId: step.workflowId,
  });
}
