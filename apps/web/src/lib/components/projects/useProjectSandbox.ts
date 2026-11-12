"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { useSandboxLifecycle } from "@/lib/components/sandbox/useSandboxLifecycle";
import { useOwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { isProjectPreviewPhase, sandboxStartupEntityId } from "@eva/shared";
import { toast } from "@vvedantb/ui";

/**
 * A project's sandbox: its session's (`useOwnedSession`), which the project
 * chat, builds and tasks share. Start, Stop and background commands act on
 * that session, creating it on first need.
 */
export function useProjectSandbox(
  projectId: Id<"projects">,
  phase: string | undefined,
) {
  const projectSession = useOwnedSession({ kind: "project", projectId });
  const { sandbox } = projectSession;
  const startSessionSandbox = useMutation(api.sessions.startSandbox);
  const stopSessionSandbox = useMutation(api.sessions.stopSandbox);
  const runSessionBackgroundCommands = useMutation(
    api.sessions.runBackgroundCommands,
  );

  const lifecycle = useSandboxLifecycle(sandbox.status);
  const [isRunningBackgroundCommands, setIsRunningBackgroundCommands] =
    useState(false);

  const canStartSandbox = isProjectPreviewPhase(phase);
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
        await onSession(stopSessionSandbox);
      } catch (err) {
        console.error("Failed to stop project sandbox:", err);
        toast.error("Could not stop the sandbox. Try again.");
      }
    });

  const handleRunBackgroundCommands = async () => {
    setIsRunningBackgroundCommands(true);
    try {
      await onSession(runSessionBackgroundCommands);
    } catch (err) {
      console.error("Failed to run project background commands:", err);
      toast.error("Could not run the background commands. Try again.");
    }
    setIsRunningBackgroundCommands(false);
  };

  return {
    /** The project's session and chat; the sandbox fields come off it. */
    projectSession,
    sandbox,
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting: lifecycle.isStarting,
    isSandboxStopping: lifecycle.isStopping,
    sandboxStartupActivity: sandboxStartupStreaming?.currentActivity,
    sandboxId: sandbox.sandboxId,
    handleStartSandbox,
    handleStopSandbox,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
  };
}
