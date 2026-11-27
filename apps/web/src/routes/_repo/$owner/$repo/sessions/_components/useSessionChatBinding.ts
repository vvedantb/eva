"use client";

import { useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type Doc,
} from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useSessionOwnerProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useSessionTurnPorts } from "./useSessionTurnPorts";

/**
 * One chat tab of a session on the shared sandbox chat panel. The model,
 * traits and account are the chat's own (`useChatModel`), and the picker
 * lists the session owner's accounts, not the viewer's: the turn always runs
 * on the owner's credentials. `isRouteActive` false (a hidden cached shell)
 * skips the live reads.
 */
export function useSessionChatBinding({
  session,
  chat,
  isRouteActive,
}: {
  session: Doc<"sessions">;
  /** The chat tab shown. */
  chat: Doc<"sessionChats">;
  isRouteActive: boolean;
}): SandboxChatBinding {
  const { repo } = useRepo();
  const sessionId = session._id;
  const chatId = chat._id;
  const accounts = useSessionOwnerProviderAccounts(sessionId, isRouteActive);
  const chatModel = useChatModel(
    chatId,
    normalizeAIModel(repo.defaultModel),
    isRouteActive,
  );
  const { model, traits, providerAccountId } = chatModel;
  // Every visible model, across providers: a session may move onto another
  // provider mid-conversation, and each pick carries the account it was made
  // under so credentials follow the new provider.
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);
  const ports = useSessionTurnPorts(chatId, accounts.options);
  const stopChat = useMutation(api.chats.stop);

  return {
    entity: { kind: "session", sessionId, chatId },
    ownerLabel: "session",
    prOwner: { kind: "session", sessionId },
    active: isRouteActive,
    doc: {
      title: session.title,
      sandboxBranch: session.sandboxBranch,
      backgroundAgents: chat.backgroundAgents,
      goal: chat.goal,
      providerAccountId: providerAccountId ?? undefined,
    },
    intendedBranch: session.branchName,
    model,
    setModel: chatModel.setModel,
    modelOptions,
    displayTraits: resolveTraitsForDisplay(model, traits),
    executionTraits: buildTraitsExecutionPayload(model, traits),
    onTraitsChange: chatModel.setTraits,
    providerAccountId,
    accounts: accounts.options,
    resolveAccountId: accounts.resolveId,
    switchProviderAccount: chatModel.setProviderAccountId,
    isSwitchingAccount: chatModel.isSwitchingAccount,
    ports,
    cancel: () => stopChat({ target: chatId }),
  };
}
