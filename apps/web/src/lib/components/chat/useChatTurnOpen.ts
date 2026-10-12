import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";

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
