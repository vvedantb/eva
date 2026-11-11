"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc, Id } from "@eva/backend";
import { useSandboxLifecycle } from "@/lib/components/sandbox/useSandboxLifecycle";
import { sandboxStartupEntityId } from "@eva/shared";
import { toast } from "@vvedantb/ui";

const PREVIEW_SANDBOX_ALLOWED_PHASES = [
  "in_progress",
  "business_review",
  "code_review",
];

export function useProjectSandbox(
  projectId: Id<"projects">,
  phase: string | undefined,
  sandboxId: string | undefined,
  reviewProjectSandboxStatus: Doc<"projects">["reviewProjectSandboxStatus"],
) {
  const startProjectSandboxMutation = useMutation(
    api.projects.startProjectSandbox,
  );
  const stopProjectSandboxMutation = useMutation(
    api.projects.stopProjectSandbox,
  );
  const runBackgroundCommandsMutation = useMutation(
    api.projects.runProjectBackgroundCommands,
  );

  const lifecycle = useSandboxLifecycle(reviewProjectSandboxStatus);
  const [isRunningBackgroundCommands, setIsRunningBackgroundCommands] =
    useState(false);

  const canStartSandbox =
    phase !== undefined && PREVIEW_SANDBOX_ALLOWED_PHASES.includes(phase);
  const isSandboxActive = reviewProjectSandboxStatus === "active";
  const isSandboxStartingFromStatus = reviewProjectSandboxStatus === "starting";

  const sandboxStartupStreaming = useQuery(
    api.streaming.get,
    isSandboxStartingFromStatus
      ? { entityId: sandboxStartupEntityId({ kind: "project", projectId }) }
      : "skip",
  );

  const handleStartSandbox = () =>
    lifecycle.run("start", async () => {
      try {
        await startProjectSandboxMutation({ projectId });
      } catch (err) {
        console.error("Failed to start project sandbox:", err);
        toast.error("Could not start the sandbox. Try again.");
      }
    });

  const handleStopSandbox = () =>
    lifecycle.run("stop", async () => {
      try {
        await stopProjectSandboxMutation({ projectId });
      } catch (err) {
        console.error("Failed to stop project sandbox:", err);
        toast.error("Could not stop the sandbox. Try again.");
      }
    });

  const handleRunBackgroundCommands = async () => {
    setIsRunningBackgroundCommands(true);
    try {
      await runBackgroundCommandsMutation({ projectId });
    } catch (err) {
      console.error("Failed to run project background commands:", err);
      toast.error("Could not run the background commands. Try again.");
    }
    setIsRunningBackgroundCommands(false);
  };

  return {
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting: lifecycle.isStarting,
    isSandboxStopping: lifecycle.isStopping,
    sandboxStartupActivity: sandboxStartupStreaming?.currentActivity,
    sandboxId,
    handleStartSandbox,
    handleStopSandbox,
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
  };
}
