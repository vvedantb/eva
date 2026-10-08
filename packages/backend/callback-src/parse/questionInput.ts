import type {
  JsonObject,
  JsonValue,
  StepQuestion,
  StepQuestionOption,
} from "../types.js";

function parseQuestionOptions(
  value: JsonValue | undefined,
): StepQuestionOption[] {
  if (!Array.isArray(value)) return [];
  const options: StepQuestionOption[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    if (typeof raw.label !== "string" || !raw.label) continue;
    options.push({
      label: raw.label,
      description:
        typeof raw.description === "string" && raw.description
          ? raw.description
          : undefined,
    });
  }
  return options;
}

/**
 * Validates an AskUserQuestion `input.questions` array into step questions.
 * Malformed questions and options are dropped silently. Shared by the tool-call
 * parser and the PRIOR_STEPS reader so both accept exactly the same shape.
 */
export function parseQuestionInput(
  input: JsonObject,
): StepQuestion[] | undefined {
  if (!Array.isArray(input.questions)) return undefined;
  const questions: StepQuestion[] = [];
  for (const raw of input.questions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    if (typeof raw.question !== "string" || !raw.question) continue;
    questions.push({
      question: raw.question,
      header:
        typeof raw.header === "string" && raw.header ? raw.header : undefined,
      multiSelect: raw.multiSelect === true ? true : undefined,
      options: parseQuestionOptions(raw.options),
    });
  }
  return questions.length > 0 ? questions : undefined;
}
