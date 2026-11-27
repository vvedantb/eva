import { modelMessageSchema, type ModelMessage } from "ai";

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
  while (kept.length > 0 && kept[0].role === "tool") kept.shift();
  return kept;
}
