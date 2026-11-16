import type { ConversationMessage } from "./ProjectChatTab";

interface OptionItem {
  label: string;
  description: string;
}

export interface ParsedQuestion {
  question: string;
  options: OptionItem[];
}

const isValidOption = (o: unknown): o is OptionItem =>
  typeof o === "object" &&
  o !== null &&
  "label" in o &&
  typeof o.label === "string" &&
  "description" in o &&
  typeof o.description === "string";

export const isParsedQuestion = (v: unknown): v is ParsedQuestion =>
  typeof v === "object" &&
  v !== null &&
  "question" in v &&
  typeof v.question === "string" &&
  "options" in v &&
  Array.isArray(v.options) &&
  v.options.every(isValidOption);

// Moved to `@eva/shared` (`projectMeta.ts`) so the phone's interview reads turns the same way.
export { isInterviewTransitionContent, isSpecContent } from "@eva/shared";

// Walks backwards from `beforeIndex` collecting activity logs from adjacent
// assistant rows that have no user-visible message yet (eg. intermediate
// streaming placeholders before the final spec arrives), so the spec card
// can show the combined log of every step it took to produce the plan.
export const mergePriorAssistantActivityLogs = (
  messages: ConversationMessage[],
  beforeIndex: number,
): string | undefined => {
  const parts: string[] = [];
  for (let j = beforeIndex - 1; j >= 0; j--) {
    const msg = messages[j];
    if (msg.role === "user") {
      break;
    }
    if (msg.activityLog) {
      parts.unshift(msg.activityLog);
    }
    if (msg.content) {
      try {
        const parsed: unknown = JSON.parse(msg.content);
        if (isParsedQuestion(parsed)) {
          break;
        }
      } catch {
        // ignore non-JSON assistant rows
      }
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n");
};
