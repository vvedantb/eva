import type { FunctionReturnType } from "convex/server";
import { type api } from "@eva/backend";
import type { DraftListItem } from "@eva/shared";

export type CommentDraft = FunctionReturnType<
  typeof api.drafts.listForRepo
>[number];

export type TaskDraft = FunctionReturnType<
  typeof api.agentTasks.listDrafts
>[number];

/** One Drafts card; the list and card labels are `@eva/shared` (`draftList`). */
export type DraftCardModel = DraftListItem<CommentDraft, TaskDraft>;
