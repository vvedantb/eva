"use client";

import {
  api,
  normalizeAIModel,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { composerTraitFields, storedComposerTraits } from "@eva/shared";
import { useAction, useMutation } from "convex/react";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { toRunTraitArgs } from "@/lib/utils/runTraits";

/**
 * Chat composer prefs backed by Convex (`sessionChats.lastModel` / trait
 * fields / `providerAccountId`) as the source of truth. Read straight off the
 * live `sessionChats.get` query — no mirrored `useState` — so picks stay
 * sticky across reloads, tabs, and devices. Each chat tab of a session keeps
 * its own picks, which is what lets two chats run on different providers.
 *
 * Changes go through sticky setters with optimistic patches. While the chat
 * query is still loading the picker shows `defaultModel`, model-default
 * traits, and Team account. Cached-hidden shells pass `active: false` so this
 * does not keep a second `sessionChats.get` live after SessionDetailClient
 * skips it.
 */
export function useChatModel(
  chatId: Id<"sessionChats">,
  defaultModel: AIModel,
  active = true,
): {
  model: AIModel;
  setModel: (model: AIModel) => void;
  /** Sticky traits from Convex; undefined fields use model defaults. */
  traits: StoredModelTraits;
  setTraits: (partial: Partial<StoredModelTraits>) => void;
  /** undefined while the chat is loading — treat as Team until the query lands. */
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  /** Resolves once the replacement daemon is warm. */
  setProviderAccountId: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => Promise<void>;
  isSwitchingAccount: boolean;
} {
  const chat = useHeldQuery(
    api.sessionChats.get,
    active ? { chatId } : "skip",
  );
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
        ...composerTraitFields(args),
      },
    );
  });

  const model = normalizeAIModel(chat?.lastModel ?? defaultModel);

  const setModel = (nextModel: AIModel) => {
    void setModelMutation({ chatId, model: normalizeAIModel(nextModel) });
  };

  const setTraits = (partial: Partial<StoredModelTraits>) => {
    void setTraitsMutation({ chatId, ...toRunTraitArgs(partial) });
  };

  return {
    model,
    setModel,
    traits: storedComposerTraits(chat),
    setTraits,
    providerAccountId:
      chat === undefined ? undefined : (chat?.providerAccountId ?? null),
    setProviderAccountId: switchProviderAccount,
    isSwitchingAccount,
  };
}
