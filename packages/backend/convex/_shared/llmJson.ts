import { LlmJson } from "@solvers-hub/llm-json";

/** Pulls JSON out of LLM text and repairs small syntax slips. */
export const llmJson = new LlmJson({ attemptCorrection: true });

/** Returns the first JSON value parsed from LLM output, or undefined if none found. */
export function extractFirstJsonValue(text: string): unknown {
  const { json } = llmJson.extract(text);
  return json.length > 0 ? json[0] : undefined;
}
