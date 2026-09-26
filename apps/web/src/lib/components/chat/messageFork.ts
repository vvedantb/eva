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
  const clipped = source.length > 48 ? `${source.slice(0, 48).trimEnd()}…` : source;
  return `Fork · ${clipped}`;
}

export function forkDialogSummary(prefix: ForkTranscriptPrefix): string {
  const count = prefix.turns.length;
  return `${count} message${count === 1 ? "" : "s"} · new chat from here`;
}

export const DEMO_FORK_MESSAGES: ReadonlyArray<{
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
}> = [
  {
    id: "user-1",
    role: "user",
    content: "The invoices table is empty on billing.",
  },
  {
    id: "asst-1",
    role: "assistant",
    content: "I'll seed the invoices empty state and retry the invoice fetch.",
  },
  {
    id: "user-2",
    role: "user",
    content: "Also hide the upgrade banner.",
  },
];

export const DEMO_FORK_THROUGH_ID = "asst-1";

export const DEMO_FORK_PREFIX: ForkTranscriptPrefix = {
  throughMessageId: DEMO_FORK_THROUGH_ID,
  turns: [
    {
      messageId: "user-1",
      role: "user",
      text: "The invoices table is empty on billing.",
    },
    {
      messageId: "asst-1",
      role: "assistant",
      text: "I'll seed the invoices empty state and retry the invoice fetch.",
    },
  ],
};
