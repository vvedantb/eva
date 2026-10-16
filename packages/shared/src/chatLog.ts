/**
 * A chat's Log rendered as markdown. One renderer for the three readers: the
 * Documents tab download, the agent's `read_chat_log` tool, and the catch-up
 * block a fresh agent session gets. Rows come from `chatLog:listForSource`.
 */

export type ChatLogKind = "decision" | "change" | "research" | "question" | "note";
export type ChatLogAuthor = "agent" | "user" | "system";

export type ChatLogRow = {
  kind: ChatLogKind;
  author: ChatLogAuthor;
  title: string;
  body?: string;
  createdAt: number;
  beforeSha?: string;
  afterSha?: string;
  /** Set when a later decision replaced this one. */
  supersededById?: string;
};

/** Caps on agent entries: a headline title and at most a few bullets. */
export const CHAT_LOG_AGENT_TITLE_MAX = 80;
export const CHAT_LOG_AGENT_BODY_MAX = 600;

export const CHAT_LOG_KIND_LABELS: Record<ChatLogKind, string> = {
  decision: "Decision",
  change: "Change",
  research: "Research",
  question: "Answered question",
  note: "Note",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "12 October 2026" (UTC, so the server and browser agree). */
export function chatLogDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Decisions nothing has replaced, oldest first. */
export function currentDecisions<T extends ChatLogRow>(rows: T[]): T[] {
  return rows.filter(
    (row) => row.kind === "decision" && row.supersededById === undefined,
  );
}

const OMISSION_RESERVE = 40;

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function entryLines(row: ChatLogRow): string[] {
  const label = CHAT_LOG_KIND_LABELS[row.kind];
  const replaced = row.supersededById !== undefined ? " (replaced)" : "";
  const lines = [`- **${label}${replaced}** (${row.author}): ${row.title}`];
  if (row.beforeSha && row.afterSha) {
    lines.push(`  Commits ${shortSha(row.beforeSha)}..${shortSha(row.afterSha)}`);
  }
  // A replaced entry keeps its title only; its replacement has the detail.
  if (row.body && !replaced) {
    for (const line of row.body.trim().split("\n")) lines.push(`  ${line}`);
  }
  return lines;
}

/**
 * Full Log as markdown, rows oldest first. With `budget`, current decisions
 * always stay and the timeline keeps its newest entries that fit.
 */
export function renderChatLogMarkdown(
  rows: ChatLogRow[],
  options: { title?: string; budget?: number } = {},
): string {
  const header = [`# ${options.title ?? "Chat log"}`];
  const decisions = currentDecisions(rows);
  const decisionBlock =
    decisions.length > 0
      ? [
          "",
          "## Current decisions",
          ...decisions.map(
            (row) =>
              `- ${row.title}${row.body ? ` — ${row.body.trim().split("\n")[0]}` : ""} (${chatLogDay(row.createdAt)})`,
          ),
        ]
      : [];

  const fixed = [...header, ...decisionBlock, "", "## Timeline"].join("\n");
  // Reserve room for the "(N older entries omitted)" line.
  let remaining =
    options.budget === undefined
      ? Infinity
      : options.budget - fixed.length - OMISSION_RESERVE;

  // Newest first so a budget drops the oldest entries. A day heading costs
  // once, when the first (oldest kept) entry of that day is admitted.
  const kept: Array<{ row: ChatLogRow; text: string }> = [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row) continue;
    const text = entryLines(row).join("\n");
    const day = chatLogDay(row.createdAt);
    const oldestKept = kept[0];
    const headingCost =
      oldestKept && chatLogDay(oldestKept.row.createdAt) === day
        ? 0
        : day.length + 6;
    const cost = text.length + 1 + headingCost;
    if (cost > remaining) break;
    kept.unshift({ row, text });
    remaining -= cost;
  }

  const timeline: string[] = [];
  const omitted = rows.length - kept.length;
  if (omitted > 0) timeline.push(`(${omitted} older entries omitted)`);
  let day = "";
  for (const { row, text } of kept) {
    const next = chatLogDay(row.createdAt);
    if (next !== day) {
      timeline.push("", `### ${next}`);
      day = next;
    }
    timeline.push(text);
  }
  if (rows.length === 0) timeline.push("No entries yet.");
  return `${fixed}\n${timeline.join("\n")}`.trimEnd();
}
