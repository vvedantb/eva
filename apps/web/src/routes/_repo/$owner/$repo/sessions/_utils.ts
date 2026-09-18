import type { Terminal } from "@xterm/xterm";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import type { PreviewPortOption } from "@/lib/components/PreviewNavBar";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";

const MAX_TERMINAL_HISTORY_CHARS = 500_000;
const FLUSH_DELAY_MS = 250;
const IMMEDIATE_FLUSH_CHARS = 4096;
/** Lines kept when syncing session console history to Convex. */
const TERMINAL_HISTORY_TAIL_LINES = 500;
const TERMINAL_HISTORY_TAIL_MAX_CHARS = 100_000;

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonObject {
  [key: string]: JsonValue;
}

type TerminalHistoryOwner =
  | { kind: "session"; sessionId: string }
  | { kind: "task"; taskId: string }
  | { kind: "project"; projectId: string };

export interface TerminalControlMessage {
  type: "control";
  status: string;
  error?: string;
}

export interface TerminalHistoryWriter {
  append: (chunk: string) => void;
  clear: () => void;
  dispose: () => void;
}

type TerminalHistorySetter = (
  value: string | ((current: string) => string),
) => void;

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string): JsonObject | null {
  try {
    const parsed: JsonValue = JSON.parse(raw);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseVercelExitMessage(
  raw: string,
): { type: "exit"; code: number | undefined } | null {
  const parsed = parseJsonObject(raw);
  if (parsed?.type !== "exit") return null;
  return {
    type: "exit",
    code: typeof parsed.code === "number" ? parsed.code : undefined,
  };
}

export function parseTerminalControlMessage(
  raw: string,
): TerminalControlMessage | null {
  const parsed = parseJsonObject(raw);
  if (parsed?.type !== "control") return null;
  if (typeof parsed.status !== "string") return null;

  return {
    type: "control",
    status: parsed.status,
    error: typeof parsed.error === "string" ? parsed.error : undefined,
  };
}

/**
 * Vercel is the only sandbox provider, so the backend's `ptyProtocol` is
 * `v.literal("vercel")`. Kept as a named type rather than inlined because the
 * terminal still negotiates protocol with the server per connection.
 */
export type PtyProtocol = "vercel";

type VercelPtyOutboundMessage =
  | {
      type: "start";
      command: string;
      args: string[];
      env: string[];
      cwd: string;
      cols: number;
      rows: number;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    };

/** Vercel controller-hosted PTY uses JSON control frames on the WebSocket. */
export function sendVercelPtyControl(
  ws: WebSocket,
  message: VercelPtyOutboundMessage,
): void {
  ws.send(JSON.stringify(message));
}

const VERCEL_PTY_CWD = "/tmp/repo";
/** Must match packages/backend/convex/_sandbox/vercelEnvFile.ts */
const EVA_ENV_FILE = "/vercel/sandbox/.eva-env.sh";
const EVA_ENV_SOURCE_CMD = `[ -f ${EVA_ENV_FILE} ] && . ${EVA_ENV_FILE}`;

function safeVercelSessionName(sessionName: string | undefined): string {
  const source =
    sessionName !== undefined && sessionName.length > 0
      ? sessionName
      : "eva_terminal";
  const safe = source.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96);
  return safe.length > 0 ? safe : "eva_terminal";
}

/** Matches Vercel sandbox CLI: token in URL, then a `start` frame launches the shell. */
export function startVercelPty(
  ws: WebSocket,
  opts: { cols: number; rows: number; cwd?: string; sessionName?: string },
): void {
  const cwd = opts.cwd ?? VERCEL_PTY_CWD;
  const sessionName = safeVercelSessionName(opts.sessionName);
  // Newlines (not ";") so `if/then/fi` is valid bash. Prefer attach to an
  // existing session so reconnects don't thrash create/destroy.
  // alternate-screen off: keep output in xterm scrollback (Console scrollbar).
  // terminal-overrides disables tmux's own outer alternate screen. The
  // alternate-screen window option below only affects programs inside tmux;
  // without both, xterm's normal buffer has no history for wheel/drag scroll.
  // status off: the status bar shrinks tmux's scroll region by one row, and
  // xterm only pushes lines into scrollback when a scroll spans the FULL
  // viewport — with the bar on, nothing ever reaches scrollback (no scrollbar).
  // mouse off (global + session): never let tmux capture the wheel.
  // New tmux sessions start bash with sandbox env sourced so typed commands
  // (e.g. pnpm run dev) see the same secrets as agent exec / auto-launch.
  sendVercelPtyControl(ws, {
    type: "start",
    command: "bash",
    args: [
      "-lc",
      [
        `cd ${cwd} 2>/dev/null || cd /vercel/sandbox || true`,
        `if command -v tmux >/dev/null 2>&1; then`,
        `  tmux has-session -t ${sessionName} 2>/dev/null || tmux new-session -d -s ${sessionName} -c ${cwd} -- bash -c '${EVA_ENV_SOURCE_CMD}; exec bash -i'`,
        `  tmux set-option -g mouse off`,
        `  tmux set-option -t ${sessionName} mouse off`,
        `  tmux show-options -sv terminal-overrides | grep -q 'xterm.*smcup@.*rmcup@' || tmux set-option -as terminal-overrides ',xterm*:smcup@:rmcup@'`,
        `  tmux set-option -t ${sessionName} alternate-screen off`,
        `  tmux set-option -t ${sessionName} status off`,
        `  tmux set-option -t ${sessionName} history-limit 50000`,
        `  exec tmux attach-session -t ${sessionName}`,
        `fi`,
        `${EVA_ENV_SOURCE_CMD}`,
        `exec bash -l`,
      ].join("\n"),
    ],
    env: ["TERM=xterm-256color"],
    cwd,
    cols: opts.cols,
    rows: opts.rows,
  });
}

/**
 * Always consume wheel in the client: scroll xterm scrollback, never forward
 * to the PTY (no bash history, no tmux mouse tracking).
 */
export function attachNormalBufferWheelScroll(terminal: Terminal): () => void {
  terminal.attachCustomWheelEventHandler((event) => {
    const host = terminal.element;
    const lineHeight =
      terminal.rows > 0 && host ? host.clientHeight / terminal.rows : 16;
    const lines = Math.max(
      1,
      Math.round(Math.abs(event.deltaY) / Math.max(lineHeight, 1)),
    );
    terminal.scrollLines(event.deltaY < 0 ? -lines : lines);
    event.preventDefault();
    return false;
  });
  return () => {
    terminal.attachCustomWheelEventHandler(() => true);
  };
}

function boundedTerminalHistory(value: string): string {
  return value.length > MAX_TERMINAL_HISTORY_CHARS
    ? value.slice(-MAX_TERMINAL_HISTORY_CHARS)
    : value;
}

/** Last `maxLines` newline-delimited lines; also caps char length. */
export function terminalHistoryTail(
  text: string,
  maxLines: number = TERMINAL_HISTORY_TAIL_LINES,
): string {
  if (maxLines <= 0 || text.length === 0) return "";
  let linesFound = 0;
  let sliceFrom = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "\n") {
      linesFound += 1;
      if (linesFound === maxLines) {
        sliceFrom = i + 1;
        break;
      }
    }
  }
  const byLines = text.slice(sliceFrom);
  return byLines.length > TERMINAL_HISTORY_TAIL_MAX_CHARS
    ? byLines.slice(-TERMINAL_HISTORY_TAIL_MAX_CHARS)
    : byLines;
}

export function buildTerminalHistoryKey(
  owner: TerminalHistoryOwner,
  sandboxId: string,
  ptyInstanceId: string,
): string {
  const ownerId =
    owner.kind === "session"
      ? owner.sessionId
      : owner.kind === "task"
        ? owner.taskId
        : owner.projectId;
  return `eva:terminal-history:${owner.kind}:${ownerId}:${sandboxId}:${ptyInstanceId}`;
}

/** One row from `sessions.listRepos` — the primary repo or a linked clone. */
export type SessionRepoListItem = FunctionReturnType<
  typeof api.sessions.listRepos
>[number];

/**
 * Dev-server ports the Preview port control offers, one per checked-out repo.
 * Empty for a single-repo session, and for a multi-repo session whose linked
 * clones declare no dev port of their own — there is nothing to choose between,
 * so the port stays a plain input.
 */
export function previewPortOptions(
  repos: readonly SessionRepoListItem[] | undefined,
  primaryPort: number,
): PreviewPortOption[] {
  if (repos === undefined || repos.length <= 1) return [];
  const options: PreviewPortOption[] = [];
  const seenPorts = new Set<number>();
  for (const repo of repos) {
    const port = repo.kind === "primary" ? primaryPort : repo.devPort;
    if (port === undefined || seenPorts.has(port)) continue;
    seenPorts.add(port);
    options.push({ port, label: `${repoDisplayLabel(repo)} · ${port}` });
  }
  return options.length > 1 ? options : [];
}

// --- CodebasesPicker (multi-repo sessions) ------------------------------

export type CodebaseRepoRow = FunctionReturnType<
  typeof api.githubRepos.list
>[number];
export type CodebaseGroup = FunctionReturnType<
  typeof api.repoGroups.listMine
>[number];

/**
 * Repos the "Add codebase" popover may ever offer: never the primary itself,
 * nor a monorepo sibling app of the primary (same `owner/name` — a linked
 * repo is always the whole checkout, so a sibling row would just clone the
 * primary a second time). Deduped by `owner/name`, preferring the root app row
 * (no `rootDirectory`) as the representative when one exists.
 */
export function pickableCodebaseRepos(
  repos: readonly CodebaseRepoRow[],
  primary: { owner: string; name: string },
): CodebaseRepoRow[] {
  const bySlug = new Map<string, CodebaseRepoRow>();
  for (const repo of repos) {
    if (repo.owner === primary.owner && repo.name === primary.name) continue;
    const slug = `${repo.owner}/${repo.name}`;
    const existing = bySlug.get(slug);
    if (!existing || (existing.rootDirectory && !repo.rootDirectory)) {
      bySlug.set(slug, repo);
    }
  }
  return [...bySlug.values()];
}

/**
 * True when picking `repo` as a linked repo would collide with the primary's
 * or an already-selected linked repo's GitHub `name` (same
 * `/tmp/workspace/<name>` sandbox directory). Mirrors
 * `validateRepoGroupMembers` on the backend so the picker disables exactly the
 * rows the mutation would reject.
 */
export function codebaseNameCollides(
  repo: { name: string },
  primary: { name: string },
  selected: readonly { name: string }[],
): boolean {
  if (repo.name === primary.name) return true;
  return selected.some((s) => s.name === repo.name);
}

/**
 * Resolves URL-stored repo ids against the loaded repo list. Ids that no
 * longer resolve (stale link, lost access) are dropped rather than forwarded
 * to a mutation as an unbranded string.
 */
export function resolveRepoIds(
  repos: readonly CodebaseRepoRow[],
  ids: readonly string[],
): Id<"githubRepos">[] {
  const byId = new Map(repos.map((repo) => [String(repo._id), repo]));
  const resolved: Id<"githubRepos">[] = [];
  for (const id of ids) {
    const repo = byId.get(id);
    if (repo) resolved.push(repo._id);
  }
  return resolved;
}

/** Resolves a URL-stored codebase group id against the loaded groups list. */
export function resolveRepoGroupId(
  groups: readonly CodebaseGroup[],
  id: string,
): Id<"repoGroups"> | null {
  const group = groups.find((g) => String(g._id) === id);
  return group ? group._id : null;
}

export function createTerminalHistoryWriter(
  setHistory: TerminalHistorySetter,
): TerminalHistoryWriter {
  let pending = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pending.length === 0) return;

    const chunk = pending;
    pending = "";
    setHistory((current) => boundedTerminalHistory(current + chunk));
  }

  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);

  return {
    append(chunk: string): void {
      if (chunk.length === 0) return;
      pending += chunk;
      if (pending.length >= IMMEDIATE_FLUSH_CHARS) {
        flush();
        return;
      }
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
      }
    },
    clear(): void {
      pending = "";
      setHistory("");
    },
    dispose(): void {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      flush();
    },
  };
}
