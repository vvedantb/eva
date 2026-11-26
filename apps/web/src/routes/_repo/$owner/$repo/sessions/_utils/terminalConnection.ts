export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * One terminal mount's connection lifecycle. `failed` and `exited` are final
 * for the mount: only a user Retry (a new mount) leaves them.
 */
export type TerminalConnection =
  | { status: "initialising" }
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "reconnecting"; attempt: number }
  | { status: "failed"; message: string }
  | { status: "exited"; code: number };

export type TerminalConnectionEvent =
  | { type: "init" }
  | { type: "ptyReady" }
  | { type: "handshake" }
  | { type: "socketLost" }
  | { type: "shellExited"; code: number }
  | { type: "failed"; message: string };

export const RECONNECT_EXHAUSTED_MESSAGE = "Terminal disconnected";

function isFinal(state: TerminalConnection): boolean {
  return state.status === "failed" || state.status === "exited";
}

export function reduceTerminalConnection(
  state: TerminalConnection,
  event: TerminalConnectionEvent,
): TerminalConnection {
  if (event.type === "init") return { status: "initialising" };
  if (event.type === "failed") return { status: "failed", message: event.message };
  if (isFinal(state)) return state;
  switch (event.type) {
    case "ptyReady":
      return state.status === "initialising" ? { status: "connecting" } : state;
    case "handshake":
      return { status: "connected" };
    case "shellExited":
      return { status: "exited", code: event.code };
    case "socketLost": {
      const attempt = state.status === "reconnecting" ? state.attempt + 1 : 1;
      return attempt > MAX_RECONNECT_ATTEMPTS
        ? { status: "failed", message: RECONNECT_EXHAUSTED_MESSAGE }
        : { status: "reconnecting", attempt };
    }
  }
}

export function isTerminalLoading(state: TerminalConnection): boolean {
  return state.status === "initialising" || state.status === "connecting";
}
