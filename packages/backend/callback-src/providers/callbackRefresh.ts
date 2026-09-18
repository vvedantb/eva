type CallbackRefreshBlocker =
  | "watched-turn"
  | "daemon-turn"
  | "claimed-turn"
  | "cancellation"
  | "background-agent"
  | "sdk-message"
  | "synthetic-turn-opening";

export type CallbackRefreshDecision =
  | { action: "poll" }
  | { action: "defer"; blocker: CallbackRefreshBlocker }
  | { action: "exit" };

export type CallbackRefreshState = {
  refreshPending: boolean;
  watchedTurnActive: boolean;
  daemonTurnActive: boolean;
  claimedTurnPending: boolean;
  cancellationInFlight: boolean;
  backgroundAgentCount: number;
  sdkMessagePending: boolean;
  syntheticTurnOpening: boolean;
};

/** Keeps a stale daemon alive until every piece of work it owns is settled. */
export function decideCallbackRefresh(
  state: CallbackRefreshState,
): CallbackRefreshDecision {
  if (!state.refreshPending) return { action: "poll" };
  if (state.watchedTurnActive) {
    return { action: "defer", blocker: "watched-turn" };
  }
  if (state.daemonTurnActive) {
    return { action: "defer", blocker: "daemon-turn" };
  }
  if (state.claimedTurnPending) {
    return { action: "defer", blocker: "claimed-turn" };
  }
  if (state.cancellationInFlight) {
    return { action: "defer", blocker: "cancellation" };
  }
  if (state.backgroundAgentCount > 0) {
    return { action: "defer", blocker: "background-agent" };
  }
  if (state.sdkMessagePending) {
    return { action: "defer", blocker: "sdk-message" };
  }
  if (state.syntheticTurnOpening) {
    return { action: "defer", blocker: "synthetic-turn-opening" };
  }
  return { action: "exit" };
}
