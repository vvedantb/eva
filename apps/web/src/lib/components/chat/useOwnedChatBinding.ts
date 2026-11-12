"use client";

import { useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  normalizeAIModel,
  resolveTraitsForDisplay,
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
  "accounts" | "resolveAccountId" | "firstRun"
>;

/**
 * The sandbox chat of a task or project on its owned session
 * (`useOwnedSession`): the session chat's own sticky model, traits and
 * account drive the composer, and sends go through the session chat ports.
 * Before the chat exists there is no chat to read (`entity` is undefined)
 * and the backend's `chatSeed` (what `ensureOwned` gives the chat) shows in
 * the picker. `cancel` may route a turn the chat does not own (a quick task's
 * first run) elsewhere.
 */
export function useOwnedChatBinding({
  ownedSession,
  ownerLabel,
  title,
  common,
  cancelOther,
}: {
  ownedSession: OwnedSession;
  ownerLabel: SandboxChatBinding["ownerLabel"];
  /** The owner's title; undefined while it loads. */
  title: string | undefined;
  common: OwnedChatBindingCommon;
  cancelOther?: () => Promise<null> | undefined;
}): SandboxChatBinding {
  const { repo } = useRepo();
  const { owned, session, chatSource, chatSeed } = ownedSession;
  const chatModel = useChatModel(chatSource, normalizeAIModel(chatSeed?.model));
  const ports = useSessionTurnPorts(chatSource, common.accounts);
  const cancelChat = useMutation(api.sessionWorkflow.cancelExecution);
  const { model, chat } = chatModel;
  // No chat row yet: show what the backend will seed it with.
  const traits = chat ? chatModel.traits : (chatSeed?.traits ?? {});
  const providerAccountId = chat
    ? (chat.providerAccountId ?? null)
    : (chatSeed?.providerAccountId ?? null);
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);

  return {
    ...common,
    entity:
      owned?.chatId !== undefined
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
    displayTraits: resolveTraitsForDisplay(model, traits),
    executionTraits: buildTraitsExecutionPayload(model, traits),
    onTraitsChange: chatModel.setTraits,
    providerAccountId,
    persistAccount: chatModel.persistProviderAccountId,
    prewarm: chatModel.prewarm,
    ports,
    cancel: () =>
      cancelOther?.() ??
      (owned?.chatId !== undefined
        ? cancelChat({ chatId: owned.chatId })
        : Promise.resolve(null)),
  };
}
