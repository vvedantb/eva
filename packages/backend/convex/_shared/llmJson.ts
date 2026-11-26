import { LlmJson } from "@solvers-hub/llm-json";
import type { z } from "zod";

/** Pulls JSON out of LLM text and repairs small syntax slips. */
export const llmJson = new LlmJson({ attemptCorrection: true });

/**
 * The first JSON value in LLM output, parsed by `schema`. Undefined when the
 * text holds no JSON or the first value does not match.
 */
export function parseFirstJsonValue<T>(
  text: string,
  schema: z.ZodType<T>,
): T | undefined {
  const { json } = llmJson.extract(text);
  if (json.length === 0) return undefined;
  const parsed = schema.safeParse(json[0]);
  return parsed.success ? parsed.data : undefined;
}
