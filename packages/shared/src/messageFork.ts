export interface ForkTranscriptTurn {
  readonly messageId: string;
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface ForkTranscriptPrefix {
  readonly throughMessageId: string;
  readonly turns: ReadonlyArray<ForkTranscriptTurn>;
}

const TURN_CHAR_LIMIT = 4_000;
export const FORK_PROMPT_CHAR_LIMIT = 16_000;

function forkRole(role: string): ForkTranscriptTurn["role"] | null {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  return null;
}

export function canForkMessage(message: {
  readonly isSystemAlert?: boolean;
  readonly content: string;
}): boolean {
  return message.isSystemAlert !== true && message.content.trim().length > 0;
}

export function collectForkPrefix(
  messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly content: string;
    readonly isSystemAlert?: boolean;
  }>,
  throughMessageId: string,
): ForkTranscriptPrefix | null {
  const turns: ForkTranscriptTurn[] = [];
  let found = false;
  for (const message of messages) {
    if (message.isSystemAlert === true) {
      if (message.id === throughMessageId) return null;
      continue;
    }
    const role = forkRole(message.role);
    const text = message.content.trim();
    if (role && text.length > 0) {
      turns.push({ messageId: message.id, role, text });
    }
    if (message.id === throughMessageId) {
      found = true;
      break;
    }
  }
  if (!found || turns.length === 0) return null;
  return { throughMessageId, turns };
}

/**
 * The whole conversation as a fork prefix ("Fork session"), keeping the most
 * recent turns that fit the prompt budget — the end of a long thread is what
 * the forked agent needs, and `formatForkPrompt` clips from the end.
 */
export function collectSessionForkPrefix(
  messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly content: string;
    readonly isSystemAlert?: boolean;
  }>,
): ForkTranscriptPrefix | null {
  const last = [...messages]
    .reverse()
    .find(
      (message) => forkRole(message.role) !== null && canForkMessage(message),
    );
  if (!last) return null;
  const prefix = collectForkPrefix(messages, last.id);
  if (!prefix) return null;
  // Headroom for the header, footer and per-turn speaker labels.
  const budget = FORK_PROMPT_CHAR_LIMIT - 400;
  const kept: ForkTranscriptTurn[] = [];
  let used = 0;
  for (const turn of [...prefix.turns].reverse()) {
    const size = Math.min(turn.text.length, TURN_CHAR_LIMIT) + 16;
    if (kept.length > 0 && used + size > budget) break;
    kept.unshift(turn);
    used += size;
  }
  return { throughMessageId: prefix.throughMessageId, turns: kept };
}

function escapeForkText(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

function clipTurn(text: string): string {
  if (text.length <= TURN_CHAR_LIMIT) return text;
  return `${text.slice(0, TURN_CHAR_LIMIT)}\n…`;
}

export function formatForkPrompt(prefix: ForkTranscriptPrefix): string {
  const last = prefix.turns[prefix.turns.length - 1];
  const header = [
    "<forked_thread>",
    `through: ${last?.role ?? "assistant"}`,
    `turns: ${prefix.turns.length}`,
    "",
  ].join("\n");
  const footer = [
    "</forked_thread>",
    "",
    "Continue this conversation from the last message above. Do not redo earlier work unless asked.",
  ].join("\n");
  const turns = prefix.turns
    .map((turn) => {
      const speaker = turn.role === "user" ? "You" : "Eva";
      return `${speaker}:\n${escapeForkText(clipTurn(turn.text))}`;
    })
    .join("\n");
  // The turns are what gets budgeted, not the whole prompt: slicing the
  // assembled string dropped the closing tag and the instruction, which left
  // the forked session with an unterminated block and no task.
  const turnsBudget = Math.max(
    0,
    FORK_PROMPT_CHAR_LIMIT - header.length - footer.length - 2,
  );
  const clippedTurns =
    turns.length <= turnsBudget
      ? turns
      : `${turns.slice(0, Math.max(0, turnsBudget - 2))}\n…`;
  return `${header}\n${clippedTurns}\n${footer}`;
}

export function forkThreadTitle(prefix: ForkTranscriptPrefix): string {
  const firstUser = prefix.turns.find((turn) => turn.role === "user");
  const source = (firstUser?.text ?? prefix.turns[0]?.text ?? "chat")
    .replace(/\s+/g, " ")
    .trim();
  const clipped =
    source.length > 48 ? `${source.slice(0, 48).trimEnd()}…` : source;
  return `Fork · ${clipped}`;
}

export function forkDialogSummary(prefix: ForkTranscriptPrefix): string {
  const count = prefix.turns.length;
  return `${count} message${count === 1 ? "" : "s"} · new chat from here`;
}

