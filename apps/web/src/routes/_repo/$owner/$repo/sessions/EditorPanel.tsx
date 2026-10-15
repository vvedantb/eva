import { useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconCode } from "@tabler/icons-react";
import {
  SandboxIframeService,
  type StartResult,
} from "@/lib/components/sandbox/SandboxIframeService";
import type { SandboxWake } from "@/lib/components/sandbox/SandboxAsleepState";

interface EditorPanelProps {
  cacheKey: string;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  /** Idle pause on: the Eva wake link replaces the raw sandbox URL. */
  externalHref?: string;
  wake?: SandboxWake;
}

/**
 * Code-server (in-browser VS Code) panel. Thin wrapper around
 * `SandboxIframeService` — supplies the port (8080), the toggle action, and
 * editor-specific copy. State machine + UI live in the shared component.
 */
export function EditorPanel({
  cacheKey,
  sandboxId,
  isActive,
  repoId,
  externalHref,
  wake,
}: EditorPanelProps) {
  const toggleCodeServer = useAction(api.sandbox.toggleCodeServer);

  const startAction = async (): Promise<StartResult> => {
    if (!sandboxId) return { success: false, message: "No sandbox" };
    return toggleCodeServer({ sandboxId, repoId, action: "start" });
  };

  const stopAction = async () => {
    if (!sandboxId) return;
    await toggleCodeServer({ sandboxId, repoId, action: "stop" });
  };

  return (
    <SandboxIframeService
      cacheNamespace="editor"
      cacheKey={cacheKey}
      sandboxId={sandboxId}
      isActive={isActive}
      repoId={repoId}
      port={8080}
      startAction={startAction}
      stopAction={stopAction}
      maxAttempts={20}
      icon={IconCode}
      inactiveLabel="Wake Eva up to use the editor"
      idleLabel="Editor is not running"
      startLabel="Start Editor"
      startingLabel="Starting editor..."
      pollFailedError="Editor failed to start. Check sandbox logs."
      startFailedError="Failed to start editor"
      loadFailedError="Failed to load editor"
      iframeAllow="clipboard-read; clipboard-write"
      externalHref={externalHref}
      wake={wake}
    />
  );
}
