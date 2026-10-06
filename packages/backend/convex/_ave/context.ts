import { modelMessageSchema, type ModelMessage } from "ai";

/**
 * Turns stored Manager Ave rows into the model's conversation. Pure so the
 * replay, fallback and trim rules are unit tested (`tests/aveContext.test.ts`).
 *
 * There is no provider-side transcript any more: this is Ave's whole memory.
 * Assistant rows replay their exact tool calls and results from
 * `modelMessages`, so Ave remembers which agents it started and what they
 * returned, not just what it said about them.
 */

/** How many recent rows the run reads. */
export const AVE_CONTEXT_ROWS = 30;
/** Rough character budget; the oldest turns drop first. */
export const AVE_CONTEXT_CHAR_BUDGET = 150_000;

export type AveContextRow = {
  role: "user" | "assistant";
  content: string;
  isSystemAlert?: boolean;
  modelMessages?: string;
};

/** `modelMessageSchema` is the SDK's own (Zod 4) schema, so each entry is checked with it directly. */
function parseReplay(raw: string): ModelMessage[] | null {
  let decoded;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(decoded)) return null;
  const messages: ModelMessage[] = [];
  for (const entry of decoded) {
    const parsed = modelMessageSchema.safeParse(entry);
    if (!parsed.success) return null;
    messages.push(parsed.data);
  }
  return messages;
}

function rowMessages(row: AveContextRow): ModelMessage[] {
  if (row.role === "user") return [{ role: "user", content: row.content }];
  if (row.modelMessages !== undefined) {
    const replay = parseReplay(row.modelMessages);
    if (replay !== null && replay.length > 0) return replay;
  }
  return [{ role: "assistant", content: row.content }];
}

/** Rows oldest first. System alerts and empty rows carry nothing for the model. */
export function buildModelMessages(
  rows: ReadonlyArray<AveContextRow>,
): ModelMessage[] {
  const turns = rows
    .filter((row) => row.isSystemAlert !== true && row.content.trim() !== "")
    .map(rowMessages);

  let size = 0;
  let keepFrom = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    size += JSON.stringify(turns[i]).length;
    if (size > AVE_CONTEXT_CHAR_BUDGET && keepFrom < turns.length) break;
    keepFrom = i;
  }
  const kept = turns.slice(keepFrom).flat();
  // A replay that begins with an assistant or tool message is fine for the
  // model; one that begins with a tool result orphaned from its call is not.
  while (kept.length > 0 && kept[0].role === "tool") kept.shift();
  return kept;
}
