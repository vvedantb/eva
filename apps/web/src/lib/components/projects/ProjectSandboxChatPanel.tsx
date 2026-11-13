"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  api,
  DEFAULT_AI_MODEL,
  normalizeAIModel,
  type Id,
} from "@eva/backend";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useOwnedChatBinding } from "@/lib/components/chat/useOwnedChatBinding";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useProjectOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";

export function ProjectSandboxChatPanel({
  projectId,
  projectSession,
  ...panel
}: SandboxChatPanelProps & {
  projectId: Id<"projects">;
  projectSession: OwnedSession;
}) {
  const binding = useProjectChatBinding(projectId, projectSession);
  return <SandboxChatPanel binding={binding} {...panel} />;
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
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const { options: accounts, resolveId: resolveAccountId } =
    useProjectOwnerProviderAccounts(projectId);
  // Before the session exists, the same seed `ensureOwned` gives its chat.
  const seedModel = normalizeAIModel(
    project?.model ?? repo.defaultModel ?? DEFAULT_AI_MODEL,
  );
  return useOwnedChatBinding({
    ownedSession: projectSession,
    seedModel,
    ownerLabel: "project",
    title: project?.title,
    common: { accounts, resolveAccountId },
  });
}
