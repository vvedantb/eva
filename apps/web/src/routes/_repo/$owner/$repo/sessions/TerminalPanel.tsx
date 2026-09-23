import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { Button, Spinner } from "@eva/ui";
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

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ptyProtocolRef = useRef<PtyProtocol>("vercel");
  const intentionalCloseRef = useRef(false);
  /** Set when the Vercel interactive shell sends an exit frame — do not reconnect. */
  const shellExitedRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
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
  useEffect(() => {
    if (seededHistoryRef.current) return;
    if (stickyHistoryTail === undefined) return;
    seededHistoryRef.current = true;
    if (terminalHistory.length === 0 && stickyHistoryTail.length > 0) {
      setTerminalHistory(stickyHistoryTail);
    }
  }, [stickyHistoryTail, terminalHistory.length, setTerminalHistory]);

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
      mounted: { current: boolean },
      historyWriter: TerminalHistoryWriter,
    ) => Promise<void>
  >(async () => {});

  // Sync latest connect closure into a ref each commit (not during render) so
  // the mount effect can call a stable ref without re-subscribing.
  useEffect(() => {
    connectWebSocketRef.current = async (
      terminal: Terminal,
      mounted: { current: boolean },
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

      if (!mounted.current) return;

      ptyProtocolRef.current = ptyProtocol;
      if (ptyProtocol === "vercel") {
        historyWriter.clear();
        terminal.clear();
      }
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
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
        reconnectAttemptsRef.current = 0;
        terminalInstanceRef.current.writeln(
          "\x1b[32m* Connected to sandbox\x1b[0m\r\n",
        );
        // Vercel Console attaches via tmux; sessions usually start the server
        // from the backend into that tmux session. Tasks/projects still auto-
        // start here when isNewPty (no prior tmux session).
        if (
          isNewPty &&
          runDevCommandOnConnect &&
          devCommand &&
          ws.readyState === WebSocket.OPEN
        ) {
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
          reconnectAttemptsRef.current = 0;
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
            shellExitedRef.current = true;
            terminalInstanceRef.current.writeln(
              `\r\n\x1b[33m* Shell exited (${exitFrame.code ?? 0})\x1b[0m\r\n`,
            );
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
        if (
          !mounted.current ||
          intentionalCloseRef.current ||
          shellExitedRef.current ||
          reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS
        ) {
          return;
        }

        reconnectAttemptsRef.current++;
        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.writeln(
            `\r\n\x1b[33m* Reconnecting (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...\x1b[0m`,
          );
        }

        setTimeout(() => {
          if (
            mounted.current &&
            terminalInstanceRef.current &&
            !shellExitedRef.current &&
            !intentionalCloseRef.current
          ) {
            connectWebSocketRef
              .current(terminalInstanceRef.current, mounted, historyWriter)
              .catch(() => {});
          }
        }, RECONNECT_DELAY_MS);
      };
    };
  });

  useEffect(() => {
    if (!isActive || !sandboxId || !terminalRef.current) {
      return;
    }

    const mounted = { current: true };
    const containerEl = terminalRef.current;
    const historyWriter = createTerminalHistoryWriter(
      setTerminalHistoryWithSticky,
    );
    let detachWheelScroll = () => {};

    const initTerminal = async () => {
      setIsLoading(true);
      setError(null);
      intentionalCloseRef.current = false;
      shellExitedRef.current = false;
      reconnectAttemptsRef.current = 0;

      try {
        if (wsRef.current) {
          intentionalCloseRef.current = true;
          wsRef.current.close();
          wsRef.current = null;
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
          const currentWs = wsRef.current;
          if (!currentWs) return;
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

        await connectWebSocketRef.current(terminal, mounted, historyWriter);
      } catch (err) {
        if (mounted.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to initialize terminal",
          );
          setIsLoading(false);
        }
      }
      if (mounted.current) {
        setIsLoading(false);
      }
    };

    void initTerminal();

    return () => {
      mounted.current = false;
      intentionalCloseRef.current = true;
      detachWheelScroll();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
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
    if (
      ptyProtocolRef.current === "vercel" &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      sendVercelPtyControl(wsRef.current, { type: "resize", cols, rows });
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
        if (
          ptyProtocolRef.current === "vercel" &&
          wsRef.current?.readyState === WebSocket.OPEN
        ) {
          sendVercelPtyControl(wsRef.current, { type: "resize", cols, rows });
        } else {
          resizePtyRef
            .current({ owner, cols, rows, ptyInstanceId })
            .catch(() => {});
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ownerKey, owner, ptyInstanceId, isForeground]);

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

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setRetryCount((c) => c + 1)}
        >
          <IconRefresh className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {isLoading && (
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
