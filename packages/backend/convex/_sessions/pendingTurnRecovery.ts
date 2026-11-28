import type { TurnState } from "../_validators/tableFields";

type OpenTurnCandidate = {
  role: string;
  finishedAt?: number;
  isSyntheticTurn?: boolean;
};

/**
 * Whether a daemon already claimed this durable turn. The lease is the proof:
 * a claim moves the turn to `running`, and the daemon's completion moves it on
 * to `finalizing`. Restaging a claimed turn runs its prompt a second time.
 */
export function isTurnClaimed(turn: { state: TurnState } | null): boolean {
  return turn?.state === "running" || turn?.state === "finalizing";
}

export function isPendingTurnLive(params: {
  pendingTurn: { turnId?: string } | undefined;
  openTurnId: string | undefined;
}): boolean {
  if (params.pendingTurn === undefined) return false;
  if (params.openTurnId === undefined) return true;
  return params.pendingTurn.turnId === params.openTurnId;
}

export function isUnclaimedOpenTurn(params: {
  hasPendingTurn: boolean;
  lastAssistant: OpenTurnCandidate | undefined | null;
}): boolean {
  const { hasPendingTurn, lastAssistant } = params;
  if (hasPendingTurn) return false;
  if (!lastAssistant) return false;
  if (lastAssistant.role !== "assistant") return false;
  if (lastAssistant.finishedAt !== undefined) return false;
  if (lastAssistant.isSyntheticTurn === true) return false;
  return true;
}
