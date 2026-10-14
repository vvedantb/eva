import { api } from "@eva/backend";
import type { FunctionReference, FunctionArgs } from "convex/server";
import { convex } from "@/lib/convex";
import { parseRouteNumId } from "@/lib/numId";
import { decodeRepoParam } from "@/lib/utils/repoUrl";

/**
 * How long a prefetched subscription outlives the hover that started it. Long
 * enough to cover a slow click; short enough that sweeping the pointer down
 * the sidebar does not keep dozens of transcripts live.
 */
const PREFETCH_HOLD_MS = 30_000;

function prewarm<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
) {
  convex.prewarmQuery({ query, args, extendSubscriptionFor: PREFETCH_HOLD_MS });
}

/**
 * Warms the queries a session page opens with, so clicking a session that is
 * not one of the kept-alive shells paints from the client cache instead of
 * waiting on three round trips (numId → chat → transcript).
 *
 * Args must match the page's own subscriptions exactly (`CachedSessionShell`,
 * `SessionDetailClient`), or the warm result sits under a different key.
 * Fire-and-forget: a failure only means the page loads the normal way.
 */
export async function prefetchSession(params: {
  owner: string;
  repo: string;
  numId: string;
}): Promise<void> {
  const numId = parseRouteNumId(params.numId);
  if (numId === null) return;
  const { name, appName } = decodeRepoParam(params.repo);
  const repo = await convex.query(api.githubRepos.getByOwnerAndName, {
    owner: params.owner,
    name,
    appName,
  });
  if (!repo) return;
  // Warm first, then read: `convex.query` reuses the warm subscription, so the
  // result is not dropped and refetched between the two.
  const byNumId = { repoId: repo._id, numId };
  prewarm(api.sessions.getByNumId, byNumId);
  const session = await convex.query(api.sessions.getByNumId, byNumId);
  if (!session) return;
  const sessionId = session._id;
  prewarm(api.sessions.get, { id: sessionId });
  prewarm(api.sessionChats.listForSession, { sessionId });
  prewarm(api.turns.listSessionChatStatuses, { sessionId });
  prewarm(api.sessionChats.resolveForSession, { sessionId });
  const chat = await convex.query(api.sessionChats.resolveForSession, {
    sessionId,
  });
  if (!chat) return;
  prewarm(api.messages.listByParent, { parentId: chat._id });
  prewarm(api.queuedMessages.listByParent, { parentId: chat._id });
  prewarm(api.streaming.get, { entityId: chat._id });
}
