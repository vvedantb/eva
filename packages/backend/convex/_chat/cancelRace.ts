/**
 * Cancel vs concurrent startExecute: a newer staged prompt or a different
 * tracked workflow must not be treated as the cancel's own turn.
 */
export function detectCancelSupersession(input: {
  latestPendingTurn?: { requestedAt: number };
  cancelPendingRequestedAt?: number;
  latestActiveWorkflowId?: string;
  cancelWorkflowId?: string;
}): {
  newerTurnStaged: boolean;
  newerWorkflowTracked: boolean;
  cancelOwnsCurrentTurn: boolean;
} {
  const newerTurnStaged =
    input.latestPendingTurn !== undefined &&
    input.latestPendingTurn.requestedAt !== input.cancelPendingRequestedAt;
  const newerWorkflowTracked =
    input.latestActiveWorkflowId !== undefined &&
    input.latestActiveWorkflowId !== input.cancelWorkflowId;
  return {
    newerTurnStaged,
    newerWorkflowTracked,
    cancelOwnsCurrentTurn: !newerTurnStaged && !newerWorkflowTracked,
  };
}
