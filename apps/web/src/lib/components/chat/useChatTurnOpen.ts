import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs } from "convex/server";

/**
 * Whether one chat (session, task or project) has a turn open, read from its
 * durable turn. Synthetic turns count, so a daemon-minted continuation shows
 * as working. `undefined` while the status loads; callers pick the fallback.
 */
export function useChatTurnOpen(
  entityId: Id<"sessions"> | Id<"agentTasks"> | Id<"projects"> | undefined,
): boolean | undefined {
  const status = useQuery(
    api.turns.getChatStatus,
    entityId === undefined ? "skip" : { entityId },
  );
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
