import { api } from "@eva/backend";
import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import type { ChatBodyQueuedMessage } from "@/lib/components/chat/chatBodyUtils";

export function useQueuedMessageMutations(
  queuedMessages: ChatBodyQueuedMessage[],
) {
  const updateQueuedMessage = useMutation(
    api.queuedMessages.update,
  ).withOptimisticUpdate((localStore, args) => {
    const msg = queuedMessages.find((m) => m._id === args.id);
    if (!msg) return;
    patchLoadedQuery(
      localStore,
      api.queuedMessages.listByParent,
      { parentId: msg.parentId },
      (current) =>
        current.map((m) =>
          m._id === args.id ? { ...m, content: args.content } : m,
        ),
    );
  });
  const deleteQueuedMessage = useMutation(
    api.queuedMessages.remove,
  ).withOptimisticUpdate((localStore, args) => {
    const msg = queuedMessages.find((m) => m._id === args.id);
    if (!msg) return;
    patchLoadedQuery(
      localStore,
      api.queuedMessages.listByParent,
      { parentId: msg.parentId },
      (current) => current.filter((m) => m._id !== args.id),
    );
  });
  const reorderQueuedMessages = useMutation(
    api.queuedMessages.reorder,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.queuedMessages.listByParent,
      { parentId: args.parentId },
      (current) => {
        const byId = new Map(current.map((m) => [m._id, m]));
        return args.orderedIds
          .map((id) => byId.get(id))
          .filter((m): m is (typeof current)[number] => m !== undefined);
      },
    );
  });

  // Shows "Steering…" at once; the server may instead send the row as the
  // next turn (Cursor, OpenCode, idle chat), which removes it.
  const steerQueuedMessage = useMutation(
    api.queuedMessages.steer,
  ).withOptimisticUpdate((localStore, args) => {
    const msg = queuedMessages.find((m) => m._id === args.id);
    if (!msg) return;
    patchLoadedQuery(
      localStore,
      api.queuedMessages.listByParent,
      { parentId: msg.parentId },
      (current) =>
        current.map((m) =>
          m._id === args.id ? { ...m, steer: "requested" as const } : m,
        ),
    );
  });

  return {
    updateQueuedMessage,
    deleteQueuedMessage,
    reorderQueuedMessages,
    steerQueuedMessage,
  };
}
