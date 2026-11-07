import { z } from "zod";

/**
 * The agent's blocking question (AskUserQuestion input), stored as JSON on
 * `pendingQuestions.payload` and on streaming rows. Shared by the web chat,
 * the mobile app and the backend push text.
 *
 * A question with any malformed field (or option) is dropped via
 * `.catch(null)` + filter rather than failing the whole payload.
 */
const questionSchema = z.object({
  question: z.string(),
  header: z.string(),
  multiSelect: z.boolean(),
  options: z.array(z.object({ label: z.string(), description: z.string() })),
});

export type ParsedQuestion = z.infer<typeof questionSchema>;

const pendingQuestionSchema = z.object({
  questions: z.array(questionSchema.nullable().catch(null)),
});

export function parsePendingQuestion(
  raw: string | undefined | null,
): ParsedQuestion[] | null {
  if (!raw) return null;
  try {
    const parsed = pendingQuestionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const questions = parsed.data.questions.flatMap((q) => (q ? [q] : []));
    return questions.length > 0 ? questions : null;
  } catch {
    return null;
  }
}

/**
 * The answer `pendingQuestions.answer` expects: question text → selected
 * label, or the free-text "Other" reply. Multi-select joins labels with ", ",
 * the shape AskUserQuestion reads from `updatedInput.answers`.
 */
export function buildStructuredAnswer(
  questions: ReadonlyArray<ParsedQuestion>,
  answerFor: (question: ParsedQuestion, index: number) => readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  questions.forEach((question, index) => {
    const selected = answerFor(question, index);
    result[question.question] = question.multiSelect
      ? selected.join(", ")
      : (selected[0] ?? "");
  });
  return result;
}
