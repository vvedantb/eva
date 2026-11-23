"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useOwnedChatBinding } from "@/lib/components/chat/useOwnedChatBinding";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { useProjectOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import { CoordinatorPausedBanner } from "./CoordinatorPausedBanner";
import { useProjectTaskBatchCards } from "./useProjectTaskBatchCards";

export function ProjectSandboxChatPanel({
  projectId,
  projectSession,
  ...panel
}: SandboxChatPanelProps & {
  projectId: Id<"projects">;
  projectSession: OwnedSession;
}) {
  const binding = useProjectChatBinding(projectId, projectSession);
  // The coordinator chat only: its proposed task batches and its paused line.
  const taskBatchCards = useProjectTaskBatchCards(projectId);
  const chat = (
    <SandboxChatPanel
      binding={binding}
      {...panel}
      inlineCards={taskBatchCards}
      preInputBanner={
        <CoordinatorPausedBanner projectId={projectId} canSend />
      }
    />
  );
  if (!panel.isReadOnly) return chat;
  // A viewer has no composer, so the paused line sits at the chat's foot,
  // in the composer's column and inset.
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1">{chat}</div>
      <div className="mx-auto w-full max-w-3xl px-3 pb-1 md:px-4 md:pb-2">
        <CoordinatorPausedBanner projectId={projectId} canSend={false} />
      </div>
    </div>
  );
}

/**
 * The project side of the sandbox chat: the Main chat of the project's
 * session (`useOwnedSession`), whose own sticky model, traits and account
 * drive the composer. The chat model is apart from the project's build model.
 * The chat runs on the owner's credentials, so every viewer picks from the
 * owner's accounts (as in a session chat).
 */
export function useProjectChatBinding(
  projectId: Id<"projects">,
  projectSession: OwnedSession,
): SandboxChatBinding {
  const project = useQuery(api.projects.get, { id: projectId });
  const { options: accounts, resolveId: resolveAccountId } =
    useProjectOwnerProviderAccounts(projectId);
  return useOwnedChatBinding({
    ownedSession: projectSession,
    ownerLabel: "project",
    title: project?.title,
    common: { accounts, resolveAccountId },
  });
}
