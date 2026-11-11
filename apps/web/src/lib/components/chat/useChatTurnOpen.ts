import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

type ChatTurnEntityId = Id<"sessions"> | Id<"agentTasks"> | Id<"projects">;

/**
 * One chat's (session, task or project) open durable turn: `null` when none,
 * `undefined` while it loads. Pass it to `isChatTurnExecuting` with the
 * transcript wherever the chat is rendered.
 */
export function useChatTurnStatus(
  entityId: ChatTurnEntityId | undefined,
): FunctionReturnType<typeof api.turns.getChatStatus> | undefined {
  return useQuery(
    api.turns.getChatStatus,
    entityId === undefined ? "skip" : { entityId },
  );
}

/**
 * Whether one chat has a turn open, for surfaces that show a running badge
 * without the transcript. Synthetic turns count, so a daemon-minted
 * continuation shows as working. `undefined` while the status loads.
 */
export function useChatTurnOpen(
  entityId: ChatTurnEntityId | undefined,
): boolean | undefined {
  const status = useChatTurnStatus(entityId);
  return status === undefined ? undefined : status !== null;
}

/**
 * Optimistic update for a direct send's `startExecute`: marks the chat's turn
 * open at once, so a second send before the server answers queues behind this
 * one instead of racing it. No turn id exists yet, so it uses the `legacy`
 * shape. The server's real status replaces it when the mutation lands, which
 * also undoes it when the server queued the send or rejected it.
 */
export function openChatTurnOptimistically(
  localStore: OptimisticLocalStore,
  entityId: FunctionArgs<typeof api.turns.getChatStatus>["entityId"],
): void {
  const args = { entityId };
  if (localStore.getQuery(api.turns.getChatStatus, args)) return;
  localStore.setQuery(api.turns.getChatStatus, args, { source: "legacy" });
}
