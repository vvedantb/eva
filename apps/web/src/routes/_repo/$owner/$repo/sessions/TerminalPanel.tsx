import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { Button, Spinner } from "@vvedantb/ui";
import { IconRefresh, IconTerminal2 } from "@tabler/icons-react";
import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { SandboxOwner } from "@eva/backend";
import { useSessionStorage } from "usehooks-ts";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  attachNormalBufferWheelScroll,
  buildTerminalHistoryKey,
  createTerminalHistoryWriter,
  startVercelPty,
  parseTerminalControlMessage,
  parseVercelExitMessage,
  sendVercelPtyControl,
  terminalHistoryTail,
  type PtyProtocol,
  type TerminalHistoryWriter,
} from "./_utils";
import { TerminalKeyRow } from "./_components/TerminalKeyRow";
import {
  MAX_RECONNECT_ATTEMPTS,
  isTerminalLoading,
  reduceTerminalConnection,
  type TerminalConnection,
  type TerminalConnectionEvent,
} from "./_utils/terminalConnection";

interface TerminalPanelProps {
  owner: SandboxOwner;
  sandboxId: string | undefined;
  isActive: boolean;
  ptyInstanceId: string;
  isForeground: boolean;
  runDevCommandOnConnect: boolean;
  devCommand?: string;
  /**
   * Session Preview Console only: Convex-backed scrollback seed (last ~500
   * lines). Tab-local sessionStorage still caches a larger buffer.
   */
  stickyHistoryTail?: string;
  onStickyHistoryTailChange?: (tail: string) => void;
}

const RECONNECT_DELAY_MS = 1000;

/** One WebSocket. `close` marks it intentional so its onclose never reconnects. */
interface PtySocket {
  ws: WebSocket;
  close: () => void;
}

/**
 * Owned by one run of the connect effect. `state` is the source of truth that
 * socket callbacks read synchronously; React state mirrors it for render.
 */
interface ConnectionMount {
  active: boolean;
  state: TerminalConnection;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  dispatch: (event: TerminalConnectionEvent) => TerminalConnection;
}

const CONNECT_FAILED_MESSAGE = "Failed to initialize terminal";

/**
 * xterm takes the font size at construction, so this is read once per init
 * rather than tracked as reactive state. At 13px a 390px pane fits roughly 44
 * columns, which wraps most command output into unreadable soup; 10px gets it
 * to about 60. FitAddon still recomputes cols/rows on rotation, so only the
 * glyph size is fixed for the life of the connection.
 */
function initialTerminalFontSize(): number {
  return window.matchMedia("(max-width: 767px)").matches ? 10 : 13;
}

function getCssRgb(
  styles: CSSStyleDeclaration,
  variableName: string,
  fallback: string,
) {
  const raw = styles.getPropertyValue(variableName).trim();
  const value = raw.length > 0 ? raw : fallback;
  return `rgb(${value.split(/\s+/).join(", ")})`;
}

function getCssRgba(
  styles: CSSStyleDeclaration,
  variableName: string,
  alpha: number,
  fallback: string,
) {
  const raw = styles.getPropertyValue(variableName).trim();
  const value = raw.length > 0 ? raw : fallback;
  return `rgba(${value.split(/\s+/).join(", ")}, ${alpha})`;
}

export function TerminalPanel({
  owner,
  sandboxId,
  isActive,
  ptyInstanceId,
  isForeground,
  runDevCommandOnConnect,
  devCommand,
  stickyHistoryTail,
  onStickyHistoryTailChange,
}: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState<TerminalConnection>({
    status: "initialising",
  });
  const [retryCount, setRetryCount] = useState(0);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<PtySocket | null>(null);
  const ptyProtocolRef = useRef<PtyProtocol>("vercel");
  const terminalHistoryKey = buildTerminalHistoryKey(
    owner,
    sandboxId ?? "no-sandbox",
    ptyInstanceId,
  );
  const ownerKey =
    owner.kind === "session"
      ? `session:${owner.sessionId}`
      : owner.kind === "task"
        ? `task:${owner.taskId}`
        : `project:${owner.projectId}`;
  const [terminalHistory, setTerminalHistory] = useSessionStorage(
    terminalHistoryKey,
    "",
  );
  // Prefer Convex sticky seed when this tab has no local scrollback yet.
  const seededHistoryRef = useRef(false);
  /* eslint-disable no-effect/no-event-handler --
     Seeds sessionStorage scrollback from the Convex sticky tail the first time
     it arrives; both sides are stores outside React. */
  useEffect(() => {
    if (seededHistoryRef.current) return;
    if (stickyHistoryTail === undefined) return;
    seededHistoryRef.current = true;
    if (terminalHistory.length === 0 && stickyHistoryTail.length > 0) {
      setTerminalHistory(stickyHistoryTail);
    }
  }, [stickyHistoryTail, terminalHistory.length, setTerminalHistory]);
  /* eslint-enable no-effect/no-event-handler */

  const terminalHistoryRef = useRef(terminalHistory);
  useEffect(() => {
    terminalHistoryRef.current = terminalHistory;
  }, [terminalHistory]);

  // Debounced Convex persist of last 500 lines (sessions console only).
  const stickyPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onStickyHistoryTailChangeRef = useRef(onStickyHistoryTailChange);
  useEffect(() => {
    onStickyHistoryTailChangeRef.current = onStickyHistoryTailChange;
  }, [onStickyHistoryTailChange]);

  const setTerminalHistoryWithSticky = (
    updater: string | ((current: string) => string),
  ) => {
    setTerminalHistory((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (onStickyHistoryTailChangeRef.current) {
        if (stickyPersistTimerRef.current !== null) {
          clearTimeout(stickyPersistTimerRef.current);
        }
        stickyPersistTimerRef.current = setTimeout(() => {
          stickyPersistTimerRef.current = null;
          onStickyHistoryTailChangeRef.current?.(terminalHistoryTail(next));
        }, 2000);
      }
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (stickyPersistTimerRef.current === null) return;
      clearTimeout(stickyPersistTimerRef.current);
      stickyPersistTimerRef.current = null;
      onStickyHistoryTailChangeRef.current?.(
        terminalHistoryTail(terminalHistoryRef.current),
      );
    };
  }, []);

  const connectPty = useAction(api.pty.connectPty);
  const resizePtyAction = useAction(api.pty.resizePty);

  const resizePtyRef = useRef(resizePtyAction);
  useEffect(() => {
    resizePtyRef.current = resizePtyAction;
  }, [resizePtyAction]);

  // Keep connect logic off the connect-effect dep list. Listing the function
  // itself re-ran the effect on every parent render (preview poll, Convex
  // updates), which tore down the WebSocket, called connectPty again (log
  // spam), and cleared the Vercel console — looks like a permanent refresh.
  const connectWebSocketRef = useRef<
    (
      terminal: Terminal,
      mount: ConnectionMount,
      historyWriter: TerminalHistoryWriter,
    ) => Promise<void>
  >(async () => {});

  // Sync latest connect closure into a ref each commit (not during render) so
  // the mount effect can call a stable ref without re-subscribing.
  useEffect(() => {
    connectWebSocketRef.current = async (
      terminal: Terminal,
      mount: ConnectionMount,
      historyWriter: TerminalHistoryWriter,
    ) => {
      const {
        wsUrl,
        isNewPty,
        ptyProtocol,
        sharedPtySessionName,
        initialOutput,
      } = await connectPty({
        owner,
        cols: terminal.cols,
        rows: terminal.rows,
        ptyInstanceId,
      });

      if (!mount.active) return;

      ptyProtocolRef.current = ptyProtocol;
      if (ptyProtocol === "vercel") {
        historyWriter.clear();
        terminal.clear();
      }
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      // Socket-scoped: closing this socket on purpose must not touch the
      // reconnect decision of any later socket.
      let closedIntentionally = false;
      socketRef.current = {
        ws,
        close: () => {
          closedIntentionally = true;
          ws.close();
        },
      };
      mount.dispatch({ type: "ptyReady" });
      if (initialOutput && initialOutput.length > 0) {
        terminal.write(initialOutput.replace(/\n/g, "\r\n"));
      }
      const decoder = new TextDecoder();
      let vercelHandshakeComplete = ptyProtocol !== "vercel";

      const markConnected = () => {
        if (!terminalInstanceRef.current) return;
        if (vercelHandshakeComplete && ptyProtocol === "vercel") return;
        if (ptyProtocol === "vercel") {
          vercelHandshakeComplete = true;
        }
        // Only clear reconnect budget after a real handshake — not on bare
        // ws.onopen (shell can exit immediately and was resetting the counter).
        mount.dispatch({ type: "handshake" });
        terminalInstanceRef.current.writeln(
          "\x1b[32m* Connected to sandbox\x1b[0m\r\n",
        );
        // Vercel Console attaches via tmux; sessions usually start the server
        // from the backend into that tmux session. Tasks/projects still auto-
        // start here when isNewPty (no prior tmux session).
        /* eslint-disable no-effect/no-event-handler --
           Runs on the PTY websocket's connect handshake, which is a socket
           event rather than anything React dispatched. */
        if (
          isNewPty &&
          runDevCommandOnConnect &&
          devCommand &&
          ws.readyState === WebSocket.OPEN
        ) {
          /* eslint-enable no-effect/no-event-handler */
          terminalInstanceRef.current.writeln(
            "\x1b[33m* Starting dev server...\x1b[0m\r\n",
          );
          setTimeout(
            () => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(devCommand + "\r");
              }
            },
            ptyProtocol === "vercel" ? 500 : 300,
          );
        }
      };

      ws.onopen = () => {
        if (ptyProtocol === "vercel") {
          startVercelPty(ws, {
            cols: terminal.cols,
            rows: terminal.rows,
            sessionName: sharedPtySessionName,
          });
          // Wait for the interactive "connected" frame before clearing
          // reconnect budget — open alone can precede an immediate shell exit.
        } else {
          mount.dispatch({ type: "handshake" });
        }
      };

      ws.onmessage = (event) => {
        if (!terminalInstanceRef.current) return;

        if (typeof event.data === "string") {
          const parsed = parseTerminalControlMessage(event.data);
          if (parsed) {
            if (parsed.status === "connected") {
              markConnected();
              return;
            }
            if (parsed.status === "error") {
              terminalInstanceRef.current.writeln(
                `\x1b[31m* Error: ${parsed.error ?? "terminal error"}\x1b[0m`,
              );
              return;
            }
            return;
          }
          const exitFrame = parseVercelExitMessage(event.data);
          if (exitFrame) {
            const code = exitFrame.code ?? 0;
            terminalInstanceRef.current.writeln(
              `\r\n\x1b[33m* Shell exited (${code})\x1b[0m\r\n`,
            );
            mount.dispatch({ type: "shellExited", code });
            return;
          }
          terminalInstanceRef.current.write(event.data);
          if (ptyProtocol !== "vercel") {
            historyWriter.append(event.data);
          }
        } else {
          const text = decoder.decode(event.data, { stream: true });
          terminalInstanceRef.current.write(text);
          if (ptyProtocol !== "vercel") {
            historyWriter.append(text);
          }
        }
      };

      ws.onclose = () => {
        if (closedIntentionally || !mount.active) return;
        // Exited and exhausted are final states: the reducer keeps them, and
        // exhaustion becomes `failed` so the UI shows Retry.
        const next = mount.dispatch({ type: "socketLost" });
        if (next.status !== "reconnecting") return;

        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.writeln(
            `\r\n\x1b[33m* Reconnecting (${next.attempt}/${MAX_RECONNECT_ATTEMPTS})...\x1b[0m`,
          );
        }

        mount.reconnectTimer = setTimeout(() => {
          mount.reconnectTimer = null;
          const currentTerminal = terminalInstanceRef.current;
          if (!mount.active || !currentTerminal) return;
          connectWebSocketRef
            .current(currentTerminal, mount, historyWriter)
            .catch((err) => {
              mount.dispatch({
                type: "failed",
                message:
                  err instanceof Error ? err.message : CONNECT_FAILED_MESSAGE,
              });
            });
        }, RECONNECT_DELAY_MS);
      };
    };
  });

  useEffect(() => {
    if (!isActive || !sandboxId || !terminalRef.current) {
      return;
    }

    const mount: ConnectionMount = {
      active: true,
      state: { status: "initialising" },
      reconnectTimer: null,
      dispatch: (event) => {
        if (!mount.active) return mount.state;
        mount.state = reduceTerminalConnection(mount.state, event);
        setConnection(mount.state);
        return mount.state;
      },
    };
    const containerEl = terminalRef.current;
    const historyWriter = createTerminalHistoryWriter(
      setTerminalHistoryWithSticky,
    );
    let detachWheelScroll = () => {};

    const initTerminal = async () => {
      mount.dispatch({ type: "init" });

      try {
        if (socketRef.current) {
          socketRef.current.close();
          socketRef.current = null;
        }
        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.dispose();
        }
        detachWheelScroll();
        detachWheelScroll = () => {};

        const rootStyles = getComputedStyle(document.documentElement);
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: initialTerminalFontSize(),
          fontFamily: "Menlo, Monaco, 'Courier New', monospace",
          scrollback: 5000,
          theme: {
            background: getCssRgb(rootStyles, "--card", "17 24 39"),
            foreground: getCssRgb(rootStyles, "--foreground", "226 232 240"),
            cursor: getCssRgb(rootStyles, "--primary", "16 145 130"),
            cursorAccent: getCssRgb(rootStyles, "--card", "17 24 39"),
            selectionBackground: getCssRgba(
              rootStyles,
              "--primary",
              0.26,
              "16 145 130",
            ),
          },
          allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        terminal.open(containerEl);

        terminalInstanceRef.current = terminal;
        fitAddonRef.current = fitAddon;
        detachWheelScroll = attachNormalBufferWheelScroll(terminal);

        terminal.onData((data) => {
          // Early returns rather than `?.`: this callback is created inside the
          // try below, and React Compiler bails on the whole file when an
          // optional-chaining expression sits inside a try/catch.
          const socket = socketRef.current;
          if (!socket) return;
          const currentWs = socket.ws;
          if (currentWs.readyState !== WebSocket.OPEN) return;
          if (ptyProtocolRef.current === "vercel") {
            currentWs.send(new TextEncoder().encode(data));
          } else {
            currentWs.send(data);
          }
        });

        await new Promise<void>((resolve) => {
          setTimeout(() => {
            fitAddon.fit();
            resolve();
          }, 0);
        });

        const restoredHistory = terminalHistoryRef.current;
        if (restoredHistory.length > 0) {
          terminal.write(restoredHistory);
        }

        if (restoredHistory.length === 0) {
          // Pad the viewport so the connecting notice sits at the bottom.
          // Written as one repeated string rather than a writeln loop: React
          // Compiler bails on the whole file when a loop sits inside a
          // try/catch.
          terminal.write("\r\n".repeat(Math.max(0, terminal.rows - 1)));
        }
        terminal.writeln("\x1b[33m* Connecting to sandbox...\x1b[0m");

        await connectWebSocketRef.current(terminal, mount, historyWriter);
      } catch (err) {
        mount.dispatch({
          type: "failed",
          message: err instanceof Error ? err.message : CONNECT_FAILED_MESSAGE,
        });
      }
    };

    void initTerminal();

    return () => {
      mount.active = false;
      if (mount.reconnectTimer !== null) {
        clearTimeout(mount.reconnectTimer);
        mount.reconnectTimer = null;
      }
      detachWheelScroll();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
      historyWriter.dispose();
    };
    // connectWebSocketRef / setTerminalHistory intentionally omitted — see
    // comment above connectWebSocketRef. ownerKey (not owner) so a fresh
    // { kind, id } object from a parent render does not reconnect.
  }, [isActive, sandboxId, ownerKey, retryCount, ptyInstanceId]);

  useLayoutEffect(() => {
    if (!isForeground) {
      return;
    }
    if (!fitAddonRef.current || !terminalInstanceRef.current) {
      return;
    }
    fitAddonRef.current.fit();
    const { cols, rows } = terminalInstanceRef.current;
    const ws = socketRef.current?.ws;
    if (
      ptyProtocolRef.current === "vercel" &&
      ws?.readyState === WebSocket.OPEN
    ) {
      sendVercelPtyControl(ws, { type: "resize", cols, rows });
    } else {
      resizePtyRef
        .current({ owner, cols, rows, ptyInstanceId })
        .catch(() => {});
    }
  }, [isForeground, ownerKey, owner, ptyInstanceId]);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }
    const el = terminalRef.current;
    const observer = new ResizeObserver((entries) => {
      if (!isForeground) {
        return;
      }
      const entry = entries[0];
      if (
        !entry ||
        entry.contentRect.width === 0 ||
        entry.contentRect.height === 0
      ) {
        return;
      }
      if (fitAddonRef.current && terminalInstanceRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalInstanceRef.current;
        const ws = socketRef.current?.ws;
        if (
          ptyProtocolRef.current === "vercel" &&
          ws?.readyState === WebSocket.OPEN
        ) {
          sendVercelPtyControl(ws, { type: "resize", cols, rows });
        } else {
          resizePtyRef
            .current({ owner, cols, rows, ptyInstanceId })
            .catch(() => {});
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
    // retryCount: Retry remounts the terminal container (the error view
    // replaces it), so observe the new element.
  }, [ownerKey, owner, ptyInstanceId, isForeground, retryCount]);

  if (!isActive || !sandboxId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <IconTerminal2 className="h-12 w-12 opacity-50" />
        <p className="text-sm">
          {!isActive
            ? "Wake Eva up to use the terminal"
            : "Waiting for sandbox..."}
        </p>
      </div>
    );
  }

  if (connection.status === "failed" || connection.status === "exited") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">
          {connection.status === "failed"
            ? connection.message
            : `Shell exited (${connection.code})`}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            // Leave the error view now so the terminal container is mounted
            // when the connect effect re-runs for the new retryCount.
            setConnection({ status: "initialising" });
            setRetryCount((c) => c + 1);
          }}
        >
          <IconRefresh className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {isTerminalLoading(connection) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
          <Spinner size="lg" />
        </div>
      )}
      <div ref={terminalRef} className="min-h-0 flex-1 overflow-hidden" />
      <TerminalKeyRow
        onKey={(data) => {
          const terminal = terminalInstanceRef.current;
          if (!terminal) return;
          // `input` routes through the same `onData` handler as typing, so the
          // bytes reach the pty over the existing socket.
          terminal.input(data);
          terminal.focus();
        }}
      />
    </div>
  );
}
