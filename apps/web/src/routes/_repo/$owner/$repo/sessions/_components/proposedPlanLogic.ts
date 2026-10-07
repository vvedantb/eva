import type { Id } from "@eva/backend";

export type ProposedPlanRow = {
  _id: Id<"proposedPlans">;
  turnId?: Id<"turns">;
  messageId?: Id<"messages">;
  planMarkdown: string;
  implementedAt?: number;
  implementationSessionId?: Id<"sessions">;
  createdAt: number;
  updatedAt: number;
};

export function findLatestProposedPlan(
  proposedPlans: ReadonlyArray<ProposedPlanRow>,
): ProposedPlanRow | null {
  if (proposedPlans.length === 0) return null;
  return [...proposedPlans].toSorted(
    (left, right) =>
      right.updatedAt - left.updatedAt ||
      right.createdAt - left.createdAt ||
      left._id.localeCompare(right._id),
  )[0];
}

export function hasActionableProposedPlan(
  proposedPlan: Pick<ProposedPlanRow, "implementedAt"> | null,
): boolean {
  return proposedPlan !== null && proposedPlan.implementedAt === undefined;
}

export function proposedPlanForMessage(
  proposedPlans: ReadonlyArray<ProposedPlanRow>,
  messageId: string,
): ProposedPlanRow | null {
  return (
    proposedPlans.find((plan) => plan.messageId === messageId) ?? null
  );
}
