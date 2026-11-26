import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Infer, Validator } from "convex/values";
import { LlmJson } from "@solvers-hub/llm-json";
import { toWorkflowId, workflow } from "../workflowManager";
import { deriveLogUsage } from "../_logs/usage";

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

/** Creates or updates the streaming activity record for a given entity. */
export async function upsertStreamingActivity(
  ctx: MutationCtx,
  entityId: string,
  currentActivity: string,
): Promise<void> {
  const existing = await ctx.db
    .query("streamingActivity")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { currentActivity, lastUpdatedAt: now });
  } else {
    await ctx.db.insert("streamingActivity", {
      entityId,
      currentActivity,
      lastUpdatedAt: now,
    });
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

/**
 * Sends a completion event to a tracked workflow.
 *
 * Centralizes the branded-WorkflowId boundary so callers can pass the raw string
 * ID stored on the entity (e.g. `entity.activeWorkflowId`) without needing
 * their own cast.
 */
export async function sendCompletionEvent<
  Name extends string,
  V extends Validator<unknown, "required", string>,
>(
  ctx: MutationCtx,
  event: { name: Name; validator: V },
  workflowId: string,
  value: Infer<V>,
): Promise<void> {
  await workflow.sendEvent(ctx, {
    ...event,
    workflowId: toWorkflowId(workflowId),
    value,
  });
}

/** Inserts a completion log row used by sandbox-callback handlers across workflows. */
export async function recordCompletionLog(
  ctx: MutationCtx,
  params: {
    entityType: string;
    entityId: string;
    entityTitle: string;
    repoId: Id<"githubRepos">;
    rawResultEvent: string | undefined;
    projectId?: Id<"projects">;
  },
): Promise<void> {
  await ctx.db.insert("logs", {
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    rawResultEvent: params.rawResultEvent,
    repoId: params.repoId,
    projectId: params.projectId,
    createdAt: Date.now(),
    ...deriveLogUsage(params.rawResultEvent),
  });
}
