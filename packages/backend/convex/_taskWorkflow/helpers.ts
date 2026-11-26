import type { MutationCtx } from "../_generated/server";
import { LlmJson } from "@solvers-hub/llm-json";

export const llmJson = new LlmJson({ attemptCorrection: true });

/** Deletes the streaming activity record for a given entity ID. */
export async function clearStreamingActivity(
  ctx: MutationCtx,
  entityId: string,
): Promise<void> {
  const streamingRows = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .collect();
  for (const streaming of streamingRows) {
    await ctx.db.delete(streaming._id);
  }
}

/** Extracts a JSON block from text, handling code fences and raw JSON objects. */
export function extractJsonBlock(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch && codeBlockMatch[1]) return codeBlockMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

/** Returns the first JSON value parsed from LLM output, or undefined if none found. */
export function extractFirstJsonValue(text: string): unknown {
  const { json } = llmJson.extract(text);
  return json.length > 0 ? json[0] : undefined;
}
