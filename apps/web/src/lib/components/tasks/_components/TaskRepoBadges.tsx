"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Doc } from "@eva/backend";
import { SessionRepoBadges } from "@/routes/_repo/$owner/$repo/sessions/_components/SessionRepoBadges";

/**
 * A multi-repo task's repos, each with its PR: the session repo badges of
 * the task's own session. Nothing for a single-repo task, or before its
 * session exists.
 */
export function TaskRepoBadges({ task }: { task: Doc<"agentTasks"> }) {
  const multiRepo = (task.linkedRepoIds?.length ?? 0) > 0;
  const owned = useQuery(
    api.sessions.getOwnedWithSeed,
    multiRepo ? { owner: { kind: "task", taskId: task._id } } : "skip",
  );
  const sessionId = owned?.session?.sessionId;
  if (sessionId === undefined) return null;
  return (
    <div className="mt-2 flex">
      <SessionRepoBadges sessionId={sessionId} />
    </div>
  );
}
