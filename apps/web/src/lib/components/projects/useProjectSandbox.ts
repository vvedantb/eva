"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useSandboxControls } from "@/lib/components/sandbox/useSandboxLifecycle";
import { useOwnedSession } from "@/lib/components/sandbox/useOwnedSession";

/**
 * A project's sandbox: its session's (`useOwnedSession`), which the project
 * chat, builds and tasks share. Start acts on that
 * session, creating it on first need; Stop never creates it. A project has
 * no closed state, so its coordinator sandbox can always start.
 */
export function useProjectSandbox(projectId: Id<"projects">) {
  const projectSession = useOwnedSession({ kind: "project", projectId });
  const { sandbox } = projectSession;
  const startSessionSandbox = useMutation(api.sessions.startSandbox);
  const stopWorkSandbox = useMutation(api.sessions.stopWorkSandbox);

  const controls = useSandboxControls({
    status: sandbox.status,
    owner: sandbox.owner,
    start: async () => {
      const { sessionId } = await projectSession.ensure();
      return await startSessionSandbox({ sessionId });
    },
    stop: () => stopWorkSandbox({ target: { projectId } }),
  });

  return {
    projectSession,
    sandbox,
    sandboxId: sandbox.sandboxId,
    ...controls,
  };
}
