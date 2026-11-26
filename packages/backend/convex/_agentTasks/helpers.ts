import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { agentTaskFields, reasoningLevelValidator } from "../validators";

/**
 * Model traits a new task's form picks; they go on the task's chat
 * (`seedNewTaskChat`). Absent = the repo's default.
 */
export const runTraitFields = {
  reasoningLevel: v.optional(reasoningLevelValidator),
  thinkingEnabled: v.optional(v.boolean()),
  use1mContext: v.optional(v.boolean()),
  fastMode: v.optional(v.boolean()),
};

/** Deduplicates and trims an array of tags, preserving order. */
export function normalizeTaskTags(
  tags: string[] | undefined,
): string[] | undefined {
  if (tags === undefined) {
    return undefined;
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

/** Builds a human-readable notification message for task assignment or completion. */
export function buildTaskNotificationMessage(
  task: {
    projectId?: Id<"projects">;
    status: string;
    description?: string;
    taskNumber?: number;
  },
  action: "assigned" | "done",
): string {
  const scopeLabel = task.projectId ? "Project task" : "Quick task";
  const taskNumberLabel =
    task.taskNumber === undefined ? "" : `Task #${task.taskNumber}. `;
  const description = task.description?.trim();
  const summary =
    description && description.length > 180
      ? `${description.slice(0, 177)}...`
      : description;
  const statusPart =
    action === "assigned"
      ? `Status: ${task.status.replace(/_/g, " ")}.`
      : "Status changed to done.";
  const message = `${scopeLabel}. ${taskNumberLabel}${statusPart}`;
  return summary ? `${message} ${summary}` : message;
}

/** Convex validator for a full agent task document including system fields. */
export const agentTaskValidator = v.object({
  _id: v.id("agentTasks"),
  _creationTime: v.number(),
  ...agentTaskFields,
});
