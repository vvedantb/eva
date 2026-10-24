import type { ActivityQuestion } from "./activity-shared";

/**
 * The offered labels the user picked. A whole-answer match wins first so a
 * single-select label containing ", " is not mistaken for several picks; only
 * a multi-select answer is split on the ", " the dock joins it with.
 */
export function selectedLabels(
  answer: string | undefined,
  question: ActivityQuestion,
): string[] {
  if (answer === undefined) return [];
  const offered = new Set(question.options.map((option) => option.label));
  if (offered.has(answer)) return [answer];
  if (!question.multiSelect) return [];
  return answer.split(", ").filter((label) => offered.has(label));
}

/** Free text typed into "Other": an answer that matches no offered label. */
export function freeTextAnswer(
  answer: string | undefined,
  chosen: string[],
): string | null {
  if (answer === undefined || answer.trim().length === 0) return null;
  return chosen.length > 0 ? null : answer;
}
