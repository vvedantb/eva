import { ENTITY_ID, ENTITY_ID_FIELD, PROVIDER } from "../config.js";
import { callConvexWithRetry } from "../http/convexClient.js";
import type { JsonObject } from "../types.js";
import { log } from "../utils.js";

const PENDING_CAP = 200;
const QUEUE_CAP = 20;
const FLUSH_FAILURE_COOLDOWN_MS = 10_000;

/** Claude Code wording for a Bash tool that was backgrounded (explicit or auto). */
const BG_SHELL_ID_RE = /running in (?:the )?background.*?ID:?\s*([\w-]+)/i;

type PendingBash = { command: string };
type PendingKill = { shellId: string };

type QueueEvent =
  | {
      kind: "register";
      key: string;
      command: string;
      shellId?: string;
    }
  | {
      kind: "agent_killed";
      shellId: string;
    };

const pendingBashToolUses = new Map<string, PendingBash>();
const pendingKillShellUses = new Map<string, PendingKill>();
const eventQueue: QueueEvent[] = [];

let flushInFlight = false;
let flushCooldownUntil = 0;

function trimMap<K, V>(map: Map<K, V>, cap: number): void {
  while (map.size > cap) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}

function enqueue(event: QueueEvent): void {
  if (eventQueue.length >= QUEUE_CAP) {
    eventQueue.shift();
  }
  eventQueue.push(event);
}

/** Track every Bash / KillShell tool_use so the matching result can register or clear. */
export function trackClaudeToolUse(
  name: string,
  input: JsonObject,
  toolUseId: string,
): void {
  if (!toolUseId) return;
  if (name === "Bash" || name === "bash") {
    const command = typeof input.command === "string" ? input.command : "";
    pendingBashToolUses.set(toolUseId, { command });
    trimMap(pendingBashToolUses, PENDING_CAP);
    return;
  }
  if (name === "KillShell") {
    const shellId =
      typeof input.shell_id === "string"
        ? input.shell_id
        : typeof input.shellId === "string"
          ? input.shellId
          : "";
    if (!shellId) return;
    pendingKillShellUses.set(toolUseId, { shellId });
    trimMap(pendingKillShellUses, PENDING_CAP);
  }
}

/**
 * Registration is result-driven: only Bash results whose text says the command
 * is running in the background enqueue a Convex register (covers explicit
 * run_in_background and Claude Code auto-background of long commands).
 */
export function trackClaudeToolResult(
  toolUseId: string,
  resultText: string,
  isError: boolean,
): void {
  if (!toolUseId) return;

  const killPending = pendingKillShellUses.get(toolUseId);
  if (killPending) {
    pendingKillShellUses.delete(toolUseId);
    if (!isError) {
      enqueue({ kind: "agent_killed", shellId: killPending.shellId });
    }
    return;
  }

  const bashPending = pendingBashToolUses.get(toolUseId);
  if (!bashPending) return;
  pendingBashToolUses.delete(toolUseId);

  if (isError) return;

  const match = BG_SHELL_ID_RE.exec(resultText);
  if (!match) return;

  const shellId = match[1];
  enqueue({
    kind: "register",
    key: toolUseId,
    command: bashPending.command,
    ...(shellId ? { shellId } : {}),
  });
}

function canFlushBackgroundShells(): boolean {
  return (
    PROVIDER === "claude" &&
    (ENTITY_ID_FIELD === "sessionId" || ENTITY_ID_FIELD === "chatId") &&
    typeof ENTITY_ID === "string" &&
    ENTITY_ID.length > 0
  );
}

/**
 * Drain the FIFO register/kill queue serially. Survives turn boundaries —
 * do not clear from resetTurnState. Best-effort: runner death pre-flush
 * means the row never appears (accepted MVP gap).
 */
export async function flushBackgroundShellQueue(): Promise<void> {
  if (!canFlushBackgroundShells()) return;
  if (flushInFlight) return;
  if (Date.now() < flushCooldownUntil) return;
  if (eventQueue.length === 0) return;

  flushInFlight = true;
  // canFlushBackgroundShells already checked, but ENTITY_ID is module-level
  // `string | undefined` so narrow again for JsonObject assignment.
  const sessionId = ENTITY_ID;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    flushInFlight = false;
    return;
  }
  try {
    while (eventQueue.length > 0) {
      const event = eventQueue[0];
      if (!event) break;
      if (event.kind === "register") {
        const registerArgs: JsonObject = {
          sessionId,
          key: event.key,
          command: event.command,
        };
        if (event.shellId !== undefined) {
          registerArgs.shellId = event.shellId;
        }
        await callConvexWithRetry(
          "mutation",
          "backgroundProcesses:register",
          registerArgs,
        );
      } else {
        await callConvexWithRetry(
          "mutation",
          "backgroundProcesses:markExitedByShellId",
          { sessionId, shellId: event.shellId },
        );
      }
      eventQueue.shift();
    }
  } catch (error) {
    flushCooldownUntil = Date.now() + FLUSH_FAILURE_COOLDOWN_MS;
    log(
      "backgroundShells flush failed: " +
        (error instanceof Error ? error.message : String(error)),
    );
  } finally {
    flushInFlight = false;
  }
}

/** Test helper — reset module state between unit tests. */
export function resetBackgroundShellsForTests(): void {
  pendingBashToolUses.clear();
  pendingKillShellUses.clear();
  eventQueue.length = 0;
  flushInFlight = false;
  flushCooldownUntil = 0;
}

/** Test helper — expose the regex for unit coverage. */
export function matchBackgroundShellId(resultText: string): string | null {
  const match = BG_SHELL_ID_RE.exec(resultText);
  return match?.[1] ?? null;
}

/** Test helper — pending queue length. */
export function backgroundShellQueueLengthForTests(): number {
  return eventQueue.length;
}
