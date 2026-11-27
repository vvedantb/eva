"use client";

import { useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type Id,
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
  "accounts" | "resolveAccountId"
>;

/**
 * The sandbox chat of a task or project on its owned session
 * (`useOwnedSession`): the session chat's own sticky model, traits and
 * account drive the composer, and sends go through the session chat ports.
 * Before the chat exists there is no chat to read (`entity` is undefined)
 * and the backend's `chatSeed` (what `ensureOwned` gives the chat) shows in
 * the picker. Stop is `chats.stop` on the chat (which also stops a
 * task run streaming into it), or on `stopTarget` before the chat exists.
 */
export function useOwnedChatBinding({
  ownedSession,
  ownerLabel,
  prOwner,
  title,
  common,
  stopTarget,
}: {
  ownedSession: OwnedSession;
  ownerLabel: SandboxChatBinding["ownerLabel"];
  prOwner: SandboxChatBinding["prOwner"];
  /** The owner's title; undefined while it loads. */
  title: string | undefined;
  common: OwnedChatBindingCommon;
  stopTarget?: { taskId: Id<"agentTasks"> };
}): SandboxChatBinding {
  const { repo } = useRepo();
  const { owned, session, chatSource, chatSeed } = ownedSession;
  const chatModel = useChatModel(chatSource, normalizeAIModel(chatSeed?.model));
  const ports = useSessionTurnPorts(chatSource, common.accounts);
  const stopChat = useMutation(api.chats.stop);
  const { model, chat } = chatModel;
  // No chat row yet: show what the backend will seed it with.
  const traits = chat ? chatModel.traits : (chatSeed?.traits ?? {});
  // Undefined while an existing chat loads, so it is not shown as Team.
  const providerAccountId =
    chat === undefined && typeof chatSource === "string"
      ? undefined
      : chat
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
    prOwner,
    active: true,
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
    switchProviderAccount: chatModel.setProviderAccountId,
    isSwitchingAccount: chatModel.isSwitchingAccount,
    ports,
    // Stopping the chat also stops a task run streaming into it. Before the
    // chat exists only `stopTarget` (a task) can have something running.
    // Stopping never creates the session.
    cancel: () =>
      owned?.chatId !== undefined
        ? stopChat({ target: owned.chatId })
        : stopTarget !== undefined
          ? stopChat({ target: stopTarget.taskId })
          : Promise.resolve(null),
  };
}
