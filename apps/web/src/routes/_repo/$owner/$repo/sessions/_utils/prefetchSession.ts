import { api } from "@eva/backend";
import { chatStreamingEntityId } from "@eva/shared";
import { convex } from "@/lib/convex";
import {
  transcriptLiveArgs,
  transcriptTailArgs,
} from "@/lib/hooks/useChatTranscript";
import { prefetchRepo, prewarm } from "@/lib/convexPrefetch";
import { parseRouteNumId } from "@/lib/numId";

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
  const repo = await prefetchRepo(params);
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
  prewarm(api.queuedMessages.listByParent, { parentId: chat._id });
  prewarm(api.streaming.get, { entityId: chatStreamingEntityId(chat._id) });
  // Tail first, then the live list anchored on it, in the order
  // `useChatTranscript` asks for them.
  const tailArgs = transcriptTailArgs(chat._id);
  prewarm(api.messages.listByParent, tailArgs);
  const tail = await convex.query(api.messages.listByParent, tailArgs);
  prewarm(api.messages.listByParent, transcriptLiveArgs(chat._id, tail));
}
