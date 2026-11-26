import { api } from "@eva/backend";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { orderQueuedRows } from "./queuedMessages";

// The queue panel's edits on the web and the phone. A subpath
// (`@eva/shared/queuedMessageMutations`), not the root: it is React.

type QueueParentId = FunctionArgs<typeof api.queuedMessages.listByParent>["parentId"];
type QueuedRow = FunctionReturnType<typeof api.queuedMessages.listByParent>[number];

/** Rewrites the loaded queue of `parentId`; a queue not on screen is left alone. */
function patchQueue(
  store: OptimisticLocalStore,
  parentId: QueueParentId | undefined,
  change: (current: QueuedRow[]) => QueuedRow[],
): void {
  if (parentId === undefined) return;
  const current = store.getQuery(api.queuedMessages.listByParent, { parentId });
  if (current !== undefined) {
    store.setQuery(api.queuedMessages.listByParent, { parentId }, change(current));
  }
}

/**
 * Edit, delete, reorder and steer a chat's queued messages. Each change shows
 * at once and rolls back if the server refuses it. `parentId` is the queue's
 * chat; undefined before a task's or project's chat exists.
 */
export function useQueuedMessageMutations(parentId: QueueParentId | undefined) {
  const updateQueuedMessage = useMutation(api.queuedMessages.update).withOptimisticUpdate((store, args) =>
    patchQueue(store, parentId, (current) =>
      current.map((row) => (row._id === args.id ? { ...row, content: args.content } : row)),
    ),
  );
  const deleteQueuedMessage = useMutation(api.queuedMessages.remove).withOptimisticUpdate((store, args) =>
    patchQueue(store, parentId, (current) => current.filter((row) => row._id !== args.id)),
  );
  const reorderQueuedMessages = useMutation(api.queuedMessages.reorder).withOptimisticUpdate((store, args) =>
    patchQueue(store, args.parentId, (current) => orderQueuedRows(current, args.orderedIds)),
  );
  // Shows "Steering…" at once; the server may instead send the row as the
  // next turn (Cursor, OpenCode, idle chat), which removes it.
  const steerQueuedMessage = useMutation(api.queuedMessages.steer).withOptimisticUpdate((store, args) =>
    patchQueue(store, parentId, (current) =>
      current.map((row): QueuedRow => (row._id === args.id ? { ...row, steer: "requested" } : row)),
    ),
  );
  return { updateQueuedMessage, deleteQueuedMessage, reorderQueuedMessages, steerQueuedMessage };
}
