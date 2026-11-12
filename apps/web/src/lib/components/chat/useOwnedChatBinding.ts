"use client";

import { useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  resolveTraitsForDisplay,
  type AIModel,
} from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import { useChatModel } from "@/lib/hooks/useChatModel";
import { useSessionTurnPorts } from "@/routes/_repo/$owner/$repo/sessions/_components/useSessionTurnPorts";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import type { SandboxChatBinding } from "./sandboxChatBinding";

/** The owner-specific parts of an owned session's chat binding. */
export type OwnedChatBindingCommon = Pick<
  SandboxChatBinding,
  "accounts" | "pickerAccounts" | "resolveAccountId" | "isOwner" | "firstRun"
>;

/**
 * The sandbox chat of a task or project on its owned session
 * (`useOwnedSession`): the session chat's own sticky model, traits and
 * account drive the composer, and sends go through the session chat ports.
 * Before the session exists there is no chat to read (`entity` is
 * undefined) and `seedModel` (the seed `ensureOwned` gives the chat) shows in
 * the picker. `cancel` may route a turn the chat does not own (a quick task's
 * first run) elsewhere.
 */
export function useOwnedChatBinding({
  ownedSession,
  seedModel,
  ownerLabel,
  title,
  common,
  cancelOther,
}: {
  ownedSession: OwnedSession;
  seedModel: AIModel;
  ownerLabel: SandboxChatBinding["ownerLabel"];
  /** The owner's title; undefined while it loads. */
  title: string | undefined;
  common: OwnedChatBindingCommon;
  cancelOther?: () => Promise<null> | undefined;
}): SandboxChatBinding {
  const { repo } = useRepo();
  const { owned, session, chatSource } = ownedSession;
  const chatModel = useChatModel(chatSource, seedModel);
  const ports = useSessionTurnPorts(chatSource, common.accounts);
  const cancelChat = useMutation(api.sessionWorkflow.cancelExecution);
  const { model, chat } = chatModel;
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  return {
    ...common,
    entity: owned
      ? { kind: "session", sessionId: owned.sessionId, chatId: owned.chatId }
      : undefined,
    ownerLabel,
    doc: title === undefined
      ? undefined
      : {
          title,
          sandboxBranch: session?.sandboxBranch,
          backgroundAgents: chat?.backgroundAgents,
          goal: chat?.goal,
          providerAccountId: chat?.providerAccountId,
        },
    intendedBranch: session?.branchName,
    model,
    setModel: chatModel.setModel,
    modelOptions,
    displayTraits: resolveTraitsForDisplay(model, chatModel.traits),
    executionTraits: buildTraitsExecutionPayload(model, chatModel.traits),
    onTraitsChange: chatModel.setTraits,
    providerAccountId: chatModel.providerAccountId ?? null,
    persistAccount: chatModel.persistProviderAccountId,
    prewarm: chatModel.prewarm,
    ports,
    cancel: () =>
      cancelOther?.() ??
      (owned ? cancelChat({ chatId: owned.chatId }) : Promise.resolve(null)),
  };
}
