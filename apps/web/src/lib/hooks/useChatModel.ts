"use client";

import {
  api,
  normalizeAIModel,
  type AIModel,
  type Id,
  type ReasoningLevel,
  type StoredModelTraits,
} from "@eva/backend";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";

/**
 * Chat composer prefs backed by Convex (`sessionChats.lastModel` / trait
 * fields / `providerAccountId`) as the source of truth. Read straight off the
 * live `sessionChats.get` query — no mirrored `useState` — so picks stay
 * sticky across reloads, tabs, and devices. Each chat tab of a session keeps
 * its own picks, which is what lets two chats run on different providers.
 *
 * Changes go through sticky setters with optimistic patches. While the chat
 * query is still loading the picker shows `defaultModel`, model-default
 * traits, and Team account.
 */
export function useChatModel(
  chatId: Id<"sessionChats">,
  defaultModel: AIModel,
): {
  model: AIModel;
  setModel: (model: AIModel) => void;
  /** Sticky traits from Convex; undefined fields use model defaults. */
  traits: StoredModelTraits;
  setTraits: (partial: Partial<StoredModelTraits>) => void;
  /** undefined while the chat is loading — treat as Team until the query lands. */
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  setProviderAccountId: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => void;
  isSwitchingAccount: boolean;
} {
  const chat = useQuery(api.sessionChats.get, { chatId });
  const prewarmDaemonNow = useAction(api.sessionWorkflow.prewarmDaemonNow);
  const setModelMutation = useMutation(
    api.sessionChats.setModel,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessionChats.get, {
      chatId: args.chatId,
    });
    if (!current) return;
    localStore.setQuery(
      api.sessionChats.get,
      { chatId: args.chatId },
      { ...current, lastModel: args.model },
    );
  });
  const setProviderAccountIdMutation = useMutation(
    api.sessionChats.setProviderAccountId,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessionChats.get, {
      chatId: args.chatId,
    });
    if (!current) return;
    localStore.setQuery(
      api.sessionChats.get,
      { chatId: args.chatId },
      {
        ...current,
        providerAccountId:
          args.providerAccountId === null ? undefined : args.providerAccountId,
      },
    );
  });
  const { isSwitchingAccount, switchProviderAccount } =
    useProviderAccountHandoff({
      persist: (providerAccountId) =>
        setProviderAccountIdMutation({ chatId, providerAccountId }),
      prewarm: () => prewarmDaemonNow({ chatId }),
    });
  const setTraitsMutation = useMutation(
    api.sessionChats.setTraits,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessionChats.get, {
      chatId: args.chatId,
    });
    if (!current) return;
    localStore.setQuery(
      api.sessionChats.get,
      { chatId: args.chatId },
      {
        ...current,
        ...(args.reasoningLevel !== undefined
          ? { lastReasoningLevel: args.reasoningLevel }
          : {}),
        ...(args.thinkingEnabled !== undefined
          ? { lastThinkingEnabled: args.thinkingEnabled }
          : {}),
        ...(args.use1mContext !== undefined
          ? { lastUse1mContext: args.use1mContext }
          : {}),
        ...(args.fastMode !== undefined ? { lastFastMode: args.fastMode } : {}),
      },
    );
  });

  const model = normalizeAIModel(chat?.lastModel ?? defaultModel);

  const setModel = (nextModel: AIModel) => {
    void setModelMutation({ chatId, model: normalizeAIModel(nextModel) });
  };

  const setTraits = (partial: Partial<StoredModelTraits>) => {
    const reasoningLevel: ReasoningLevel | undefined = partial.effortLevel;
    void setTraitsMutation({
      chatId,
      ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
      ...(partial.thinkingEnabled !== undefined
        ? { thinkingEnabled: partial.thinkingEnabled }
        : {}),
      ...(partial.use1mContext !== undefined
        ? { use1mContext: partial.use1mContext }
        : {}),
      ...(partial.fastMode !== undefined ? { fastMode: partial.fastMode } : {}),
    });
  };

  return {
    model,
    setModel,
    traits: {
      effortLevel: chat?.lastReasoningLevel,
      thinkingEnabled: chat?.lastThinkingEnabled,
      use1mContext: chat?.lastUse1mContext,
      fastMode: chat?.lastFastMode,
    },
    setTraits,
    providerAccountId:
      chat === undefined ? undefined : (chat?.providerAccountId ?? null),
    setProviderAccountId: switchProviderAccount,
    isSwitchingAccount,
  };
}
