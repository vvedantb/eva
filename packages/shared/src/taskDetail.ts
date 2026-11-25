import type { api, Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { PRIORITY_LABELS, TASK_STATUS_LABELS, type TaskStatus } from "./taskMeta";

/**
 * The task overview's rules, shared by the web task detail and the phone task
 * overview: who may edit the text, how comments thread, how the activity
 * timeline reads, and how reactions group.
 */

export type TaskComment = FunctionReturnType<typeof api.taskComments.listByTask>[number];
export type TaskActivityEvent = FunctionReturnType<typeof api.taskActivity.listByTask>[number];
export type TaskReaction = FunctionReturnType<typeof api.taskReactions.listByTask>[number];
/** "comment" | "description", from the backend validator. */
export type ReactionTargetType = TaskReaction["targetType"];
type UserNameFields = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};
type TaskUser = UserNameFields & { _id: Id<"users"> };

/**
 * Statuses where the title and description are still the person's to edit:
 * before a run starts, and again while a finished run waits in business review
 * (where refining the ask before a re-run is the point). Locked while an agent
 * runs, or once the task is terminal.
 */
const TASK_TEXT_EDITABLE_STATUSES: TaskStatus[] = ["draft", "todo", "business_review"];

export function canEditTaskText(status: TaskStatus | undefined, hasActiveRun: boolean): boolean {
  if (hasActiveRun) return false;
  return TASK_TEXT_EDITABLE_STATUSES.some((s) => s === status);
}

/** Why the title or description is read-only right now. */
export function taskTextLockReason(hasActiveRun: boolean, field: "Title" | "Description"): string {
  return hasActiveRun
    ? `${field} can't be edited while the agent is running`
    : `${field} can only be edited in To Do or Business Review`;
}

/** A model can change on any active task; only terminal statuses lock it. */
export function canEditTaskModel(status: TaskStatus | undefined): boolean {
  return status !== "done" && status !== "cancelled";
}

export function getUserDisplayName(user: UserNameFields): string {
  if (user.fullName?.trim()) return user.fullName.trim();
  const parts = [user.firstName, user.lastName].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (parts.length > 0) return parts.join(" ");
  if (user.email?.trim()) return user.email.trim();
  return "Unnamed User";
}

// ── Comments ────────────────────────────────────────────────────────────────

export const DELETED_COMMENT_PLACEHOLDER = "This comment has been deleted by the author";

export function isCommentDeleted(comment: TaskComment): boolean {
  return comment.deletedAt !== undefined;
}

/** Top-level person comments for the timeline (no replies, no system rows). */
export function getTopLevelComments(comments: TaskComment[]): TaskComment[] {
  return comments.filter((comment) => comment.authorId && !comment.parentId);
}

/** Direct replies by parent id, oldest first in each thread. */
export function buildRepliesByParentId(comments: TaskComment[]): Map<Id<"taskComments">, TaskComment[]> {
  const map = new Map<Id<"taskComments">, TaskComment[]>();
  for (const comment of comments) {
    if (!comment.parentId) continue;
    const siblings = map.get(comment.parentId) ?? [];
    siblings.push(comment);
    map.set(comment.parentId, siblings);
  }
  for (const siblings of map.values()) siblings.sort((a, b) => a.createdAt - b.createdAt);
  return map;
}

// ── Activity timeline ───────────────────────────────────────────────────────

export type TaskTimelineItem =
  | { kind: "created"; timestamp: number }
  | { kind: "taskActivity"; timestamp: number; activity: TaskActivityEvent }
  | { kind: "comment"; timestamp: number; comment: TaskComment };

/** Comments sit in their own cards; neighbouring non-comment events share one rail. */
export type TaskTimelineSegment =
  | { kind: "rail"; items: Exclude<TaskTimelineItem, { kind: "comment" }>[] }
  | { kind: "comment"; item: Extract<TaskTimelineItem, { kind: "comment" }> };

/**
 * The task's timeline, oldest first: its creation, field changes and top-level
 * comments (only comments with an author). Agent runs are not here; they live
 * in the sandbox chat.
 */
export function buildTaskTimeline(options: {
  createdAt: number | undefined;
  activity: TaskActivityEvent[] | undefined;
  comments: TaskComment[] | undefined;
}): TaskTimelineSegment[] {
  const items: TaskTimelineItem[] = [];
  if (options.createdAt !== undefined) items.push({ kind: "created", timestamp: options.createdAt });
  for (const activity of options.activity ?? []) items.push({ kind: "taskActivity", timestamp: activity.createdAt, activity });
  for (const comment of getTopLevelComments(options.comments ?? [])) items.push({ kind: "comment", timestamp: comment.createdAt, comment });
  items.sort((a, b) => a.timestamp - b.timestamp);

  const segments: TaskTimelineSegment[] = [];
  for (const item of items) {
    if (item.kind === "comment") {
      segments.push({ kind: "comment", item });
      continue;
    }
    const last = segments.at(-1);
    if (last?.kind === "rail") last.items.push(item);
    else segments.push({ kind: "rail", items: [item] });
  }
  return segments;
}

const FIELD_LABELS: Record<TaskActivityEvent["field"], string> = {
  status: "status",
  assignee: "assignee",
  project: "project",
  priority: "priority",
  title: "title",
  description: "description",
  tags: "tags",
  model: "model",
  baseBranch: "base branch",
  pr: "PR",
};

// Activity values are stored as plain strings; look them up by string key.
const STATUS_LABEL_BY_VALUE = new Map<string, string>(Object.entries(TASK_STATUS_LABELS));
const PRIORITY_LABEL_BY_VALUE = new Map<string, string>(Object.entries(PRIORITY_LABELS));

function formatActivityValue(
  field: TaskActivityEvent["field"],
  value: string | undefined,
  users: readonly TaskUser[] | undefined,
): string {
  if (!value) return "none";
  switch (field) {
    case "status":
      return STATUS_LABEL_BY_VALUE.get(value) ?? value;
    case "priority":
      return PRIORITY_LABEL_BY_VALUE.get(value) ?? value;
    case "assignee":
      return users?.find((u) => u._id === value)?.fullName?.trim() || "Unknown";
    case "description":
      return value.length > 50 ? `${value.slice(0, 47)}...` : value;
    default:
      return value;
  }
}

/**
 * One activity row in words. A PR merge or close is a GitHub event, not a field
 * edit, so it reads as a sentence with no actor; a description change shows no
 * values.
 */
export type TaskActivityDescription =
  | { kind: "pr"; merged: boolean; movedTo: string }
  | {
      kind: "change";
      actor: TaskUser | undefined;
      actorName: string;
      fieldLabel: string;
      values: { from: string; to: string } | null;
    };

export function describeTaskActivity(
  event: TaskActivityEvent,
  users: readonly TaskUser[] | undefined,
): TaskActivityDescription {
  if (event.field === "pr") {
    const merged = event.newValue === "merged";
    return { kind: "pr", merged, movedTo: merged ? "Done" : "Cancelled" };
  }
  const actor = event.userId ? users?.find((u) => u._id === event.userId) : undefined;
  return {
    kind: "change",
    actor,
    actorName: event.userId ? actor?.fullName?.trim() || "Someone" : "System",
    fieldLabel: FIELD_LABELS[event.field],
    values:
      event.field === "description"
        ? null
        : {
            from: formatActivityValue(event.field, event.oldValue, users),
            to: formatActivityValue(event.field, event.newValue, users),
          },
  };
}

// ── Reactions ───────────────────────────────────────────────────────────────

/** The reactions offered first, before the full emoji list. */
export const QUICK_REACTIONS = ["👍", "❤️", "🎉", "😄", "🚀", "👀"];

export interface ReactionGroup {
  emoji: string;
  count: number;
  /** Whether the current person reacted (the chip's highlight). */
  reactedByMe: boolean;
  /** Everyone who reacted with this emoji; the current person reads "You". */
  reactors: { userId: Id<"users">; name: string }[];
}

/** A reactable target's key: (type, id). */
export function reactionTargetKey(targetType: ReactionTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/** Reactions grouped by target, then by emoji in first-seen order. */
export function groupReactions(
  reactions: readonly TaskReaction[] | undefined,
  users: readonly TaskUser[] | undefined,
  currentUserId: Id<"users"> | null | undefined,
): Map<string, ReactionGroup[]> {
  const map = new Map<string, ReactionGroup[]>();
  if (!reactions) return map;
  const nameById = new Map<Id<"users">, string>();
  for (const user of users ?? []) nameById.set(user._id, getUserDisplayName(user));
  const byTarget = new Map<string, Map<string, Id<"users">[]>>();
  for (const reaction of reactions) {
    const key = reactionTargetKey(reaction.targetType, reaction.targetId);
    const emojiMap = byTarget.get(key) ?? new Map<string, Id<"users">[]>();
    byTarget.set(key, emojiMap);
    emojiMap.set(reaction.emoji, [...(emojiMap.get(reaction.emoji) ?? []), reaction.userId]);
  }
  for (const [key, emojiMap] of byTarget) {
    map.set(
      key,
      [...emojiMap.entries()].map(([emoji, ids]) => ({
        emoji,
        count: ids.length,
        reactedByMe: currentUserId ? ids.includes(currentUserId) : false,
        reactors: ids.map((id) => ({
          userId: id,
          name: id === currentUserId ? "You" : (nameById.get(id) ?? "Someone"),
        })),
      })),
    );
  }
  return map;
}

/** The reactions list with one person's reaction toggled (the optimistic update). */
export function toggleReaction(
  reactions: readonly TaskReaction[],
  toggle: { targetType: ReactionTargetType; targetId: string; emoji: string; userId: Id<"users"> },
): TaskReaction[] {
  const index = reactions.findIndex(
    (r) =>
      r.targetType === toggle.targetType &&
      r.targetId === toggle.targetId &&
      r.userId === toggle.userId &&
      r.emoji === toggle.emoji,
  );
  return index >= 0
    ? reactions.filter((_, i) => i !== index)
    : [...reactions, { targetType: toggle.targetType, targetId: toggle.targetId, userId: toggle.userId, emoji: toggle.emoji }];
}
