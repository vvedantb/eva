import type { StatusTone } from "@vvedantb/native-ui/primitives";

/** The two list tabs: work statuses, and the closed ones (done, cancelled). */
export type QuickTaskTab = "active" | "done";

/** Parses a tab value from the segmented control; anything else is Active. */
export function parseQuickTaskTab(value: string): QuickTaskTab {
  return value === "done" ? "done" : "active";
}

/** Web status vocabulary to the native-ui dot tone. */
export function taskStatusTone(status: string): StatusTone {
  switch (status) {
    case "in_progress":
      return "progress";
    case "code_review":
      return "code-review";
    case "business_review":
      return "business-review";
    case "done":
      return "done";
    case "cancelled":
      return "cancelled";
    default:
      return "neutral";
  }
}

const TITLE_MAX = 100;

/**
 * Splits a prompt into the task title (first line, capped) and description
 * (the whole prompt, left out when the title already holds all of it).
 */
export function splitTaskPrompt(prompt: string): { title: string; description: string | undefined } {
  const text = prompt.trim();
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const title = firstLine.length > TITLE_MAX ? `${firstLine.slice(0, TITLE_MAX - 1).trimEnd()}…` : firstLine;
  return { title, description: text === title ? undefined : text };
}
