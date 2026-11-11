"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import {
  api,
  DEFAULT_AI_MODEL,
  getAIModelProvider,
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
import { useProviderAccounts } from "@/lib/hooks/useAvailableAiModels";

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
 * A teammate sees the owner's sticky account as an extra, read-only picker
 * row.
 */
export function useProjectChatBinding(
  projectId: Id<"projects">,
  projectSession: OwnedSession,
): SandboxChatBinding {
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const chat = useQuery(
    api.sessionChats.get,
    projectSession.owned ? { chatId: projectSession.owned.chatId } : "skip",
  );
  const { options: accounts, resolveId: resolveAccountId } =
    useProviderAccounts();
  const currentUserId = useQuery(api.auth.me);
  const isOwner =
    currentUserId !== undefined &&
    project?.userId !== undefined &&
    currentUserId === project.userId;
  const ownerProfile = useQuery(
    api.users.get,
    project?.userId ? { id: project.userId } : "skip",
  );
  // Before the session exists, the same seed `ensureOwned` gives its chat.
  const seedModel = normalizeAIModel(
    project?.lastChatModel ??
      project?.model ??
      repo.defaultModel ??
      DEFAULT_AI_MODEL,
  );
  const providerAccountId =
    chat?.providerAccountId ?? project?.providerAccountId;
  const pickerAccounts =
    isOwner || !providerAccountId
      ? accounts
      : [
          {
            id: providerAccountId,
            provider: getAIModelProvider(chat?.lastModel ?? seedModel),
            label: projectOwnerAccountLabel(ownerProfile),
            // The project owner's account, shown to a collaborator: theirs, not
            // the viewer's, so it must never be defaulted to.
            isOwn: false,
          },
          ...accounts,
        ];
  return useOwnedChatBinding({
    ownedSession: projectSession,
    seedModel,
    // No session yet means no transcript yet: the project keys read empty.
    fallbackEntity: { kind: "project", projectId },
    title: project?.title,
    common: { accounts, pickerAccounts, resolveAccountId, isOwner },
  });
}

function projectOwnerAccountLabel(
  ownerProfile: FunctionReturnType<typeof api.users.get> | undefined,
): string {
  return (
    ownerProfile?.firstName?.trim() ||
    ownerProfile?.fullName?.trim() ||
    "Personal"
  );
}
