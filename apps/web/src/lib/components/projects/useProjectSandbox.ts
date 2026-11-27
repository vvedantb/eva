"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useSandboxLifecycle } from "@/lib/components/sandbox/useSandboxLifecycle";
import { useOwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { sandboxStartupEntityId } from "@eva/shared";
import { toast } from "@vvedantb/ui";

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

  const lifecycle = useSandboxLifecycle(sandbox.status);

  const isSandboxActive = sandbox.status === "active";
  const isSandboxStartingFromStatus = sandbox.status === "starting";

  const sandboxStartupStreaming = useQuery(
    api.streaming.get,
    isSandboxStartingFromStatus && sandbox.owner
      ? { entityId: sandboxStartupEntityId(sandbox.owner) }
      : "skip",
  );

  const onSession = async (
    action: (args: { sessionId: Id<"sessions"> }) => Promise<null>,
  ) => {
    const { sessionId } = await projectSession.ensure();
    return await action({ sessionId });
  };

  const handleStartSandbox = () =>
    lifecycle.run("start", async () => {
      try {
        await onSession(startSessionSandbox);
      } catch (err) {
        console.error("Failed to start project sandbox:", err);
        toast.error("Could not start the sandbox. Try again.");
      }
    });

  const handleStopSandbox = () =>
    lifecycle.run("stop", async () => {
      try {
        await stopWorkSandbox({ target: { projectId } });
      } catch (err) {
        console.error("Failed to stop project sandbox:", err);
        toast.error("Could not stop the sandbox. Try again.");
      }
    });

  return {    projectSession,
    sandbox,
    isSandboxActive,
    isSandboxStarting: lifecycle.isStarting,
    isSandboxStopping: lifecycle.isStopping,
    sandboxStartupActivity: sandboxStartupStreaming?.currentActivity,
    sandboxId: sandbox.sandboxId,
    handleStartSandbox,
    handleStopSandbox,
  };
}
