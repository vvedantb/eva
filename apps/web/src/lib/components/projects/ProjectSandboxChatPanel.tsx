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

export function ProjectSandboxChatPanel({
  projectId,
  projectSession,
  onThreadOpen,
  ...panel
}: SandboxChatPanelProps & {
  projectId: Id<"projects">;
  projectSession: OwnedSession;
  /** Opens a reply thread in the rail's Replies tab. */
  onThreadOpen?: (messageId: string) => void;
}) {
  const binding = useProjectChatBinding(projectId, projectSession);
  // The coordinator chat only: Eva's replies as bubbles (it only talks and
  // delegates, so there are no diffs to frame).
  return (
    <SandboxChatPanel
      binding={binding}
      {...panel}
      assistantBubbles
      replyThreads
      onThreadOpen={onThreadOpen}
    />
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
    prOwner: { kind: "project", projectId },
    title: project?.title,
    common: { accounts, resolveAccountId },
  });
}
