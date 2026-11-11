import { tokenizedToDisplayText } from "./mentionText";

/**
 * The Drafts page list, shared by the web page and the phone Drafts section:
 * comment drafts (`drafts.listForRepo`) and quick-task drafts
 * (`agentTasks.listDrafts`) as one list, and what each card shows.
 */

/** The comment-draft fields the list reads. */
export interface CommentDraftFields {
  kind: "taskComment" | "taskChat" | "projectChat" | "sessionChat";
  parentCommentId?: string;
  contextTitle: string;
  content: string;
  updatedAt: number;
}

/** The quick-task-draft fields the list reads. */
export interface TaskDraftFields {
  title: string;
  description?: string;
  updatedAt: number;
}

export type DraftListItem<
  Comment extends CommentDraftFields,
  Task extends TaskDraftFields,
> = { source: "comment"; row: Comment } | { source: "task"; row: Task };

/**
 * Merges comment drafts and quick-task drafts into a single list sorted by
 * most recently updated descending. Both row shapes carry a required
 * `updatedAt`, so it reads off the union without narrowing.
 */
export function mergeDrafts<
  Comment extends CommentDraftFields,
  Task extends TaskDraftFields,
>(
  commentDrafts: readonly Comment[],
  taskDrafts: readonly Task[],
): DraftListItem<Comment, Task>[] {
  const items: DraftListItem<Comment, Task>[] = [
    ...commentDrafts.map(
      (row): DraftListItem<Comment, Task> => ({ source: "comment", row }),
    ),
    ...taskDrafts.map(
      (row): DraftListItem<Comment, Task> => ({ source: "task", row }),
    ),
  ];
  return items.sort((a, b) => b.row.updatedAt - a.row.updatedAt);
}

/** The card badge: where the draft was written. */
export function draftKindLabel(
  item: DraftListItem<CommentDraftFields, TaskDraftFields>,
): string {
  if (item.source === "task") return "Task";
  const { kind, parentCommentId } = item.row;
  if (kind === "taskComment") {
    return parentCommentId ? "Reply" : "Comment";
  }
  if (kind === "taskChat") return "Task chat";
  if (kind === "projectChat") return "Project chat";
  if (kind === "sessionChat") return "Session";
  return "Draft";
}

/** The card title: the task draft's title, else the surface it was written on. */
export function draftContextTitle(
  item: DraftListItem<CommentDraftFields, TaskDraftFields>,
): string {
  if (item.source === "task") {
    return item.row.title || "Untitled";
  }
  return item.row.contextTitle;
}

/** The card snippet, with mention tokens as their display text. */
export function draftSnippet(
  item: DraftListItem<CommentDraftFields, TaskDraftFields>,
): string {
  if (item.source === "task") {
    return tokenizedToDisplayText(item.row.description ?? "");
  }
  return tokenizedToDisplayText(item.row.content);
}
