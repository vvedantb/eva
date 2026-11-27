export const MAX_RECONNECT_ATTEMPTS = 3;

/**
 * One terminal mount's connection lifecycle. `failed` and `exited` are final
 * for the mount: only a user Retry (a new mount) leaves them.
 */
export type TerminalConnection =
  | { status: "initialising" }
  /** PTY is ready; the socket is opening or waiting for the Vercel handshake. */
  | { status: "connecting" }
  | { status: "connected" }
  /** The socket dropped; `attempt` of MAX_RECONNECT_ATTEMPTS is in flight. */
  | { status: "reconnecting"; attempt: number }
  | { status: "failed"; message: string }
  | { status: "exited"; code: number };

export type TerminalConnectionEvent =
  | { type: "init" }
  | { type: "ptyReady" }
  /** Vercel "connected" frame, or socket open for other protocols. */
  | { type: "handshake" }
  /** A socket closed that nobody closed on purpose. */
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
      // A reconnect stays `reconnecting` until its handshake lands.
      return state.status === "initialising" ? { status: "connecting" } : state;
    case "handshake":
      return { status: "connected" };
    case "shellExited":
      return { status: "exited", code: event.code };
    case "socketLost": {
      // The budget resets only on a handshake, so a socket that dies before
      // its handshake still spends an attempt.
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
