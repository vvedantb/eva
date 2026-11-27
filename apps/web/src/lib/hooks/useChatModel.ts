"use client";

import {
  api,
  normalizeAIModel,
  type AIModel,
  type Doc,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";
import { composerTraitFields, storedComposerTraits, toRunTraitArgs } from "@eva/shared";
import { useAction, useMutation } from "convex/react";
import {
  withSessionChat,
  type SessionChatSource,
} from "@/lib/components/chat/sandboxChatTurn";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";

/**
 * Chat composer prefs backed by Convex (`sessionChats.lastModel` / trait
 * fields / `providerAccountId`) as the source of truth. Read straight off the
 * live `sessionChats.get` query — no mirrored `useState` — so picks stay
 * sticky across reloads, tabs, and devices. Each chat tab of a session keeps
 * its own picks, which is what lets two chats run on different providers.
 *
 * Changes go through sticky setters with optimistic patches. While the chat
 * query is still loading (or the chat does not exist yet: a quick task's
 * session before its first need) the picker shows `defaultModel`,
 * model-default traits, and Team account. Cached-hidden shells pass
 * `active: false` so this does not keep a second `sessionChats.get` live
 * after SessionDetailClient skips it.
 */
export function useChatModel(
  chatSource: SessionChatSource,
  defaultModel: AIModel,
  active = true,
): {
  /** The live chat row; undefined while it loads or before it exists. */
  chat: Doc<"sessionChats"> | null | undefined;
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
  /** The raw account write and daemon warm-up, for a caller's own handoff. */
  persistProviderAccountId: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => Promise<null>;
  prewarm: () => Promise<null>;
} {
  const chat = useHeldQuery(
    api.sessionChats.get,
    active && typeof chatSource === "string"
      ? { chatId: chatSource }
      : "skip",
  );
  const prewarmDaemonNow = useAction(api.sessionWorkflow.prewarmDaemonNow);
  const setModelMutation = useMutation(
    api.sessionChats.setModel,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.sessionChats.get,
      { chatId: args.chatId },
      (cur) => cur && { ...cur, lastModel: args.model },
    );
  });
  const setProviderAccountIdMutation = useMutation(
    api.sessionChats.setProviderAccountId,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.sessionChats.get,
      { chatId: args.chatId },
      (cur) =>
        cur && {
          ...cur,
          providerAccountId:
            args.providerAccountId === null ? undefined : args.providerAccountId,
        },
    );
  });
  const persistProviderAccountId = (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) =>
    withSessionChat(chatSource, (chatId) =>
      setProviderAccountIdMutation({ chatId, providerAccountId }),
    );
  const prewarm = () =>
    withSessionChat(chatSource, (chatId) => prewarmDaemonNow({ chatId }));
  const { isSwitchingAccount, switchProviderAccount } =
    useProviderAccountHandoff({
      persist: persistProviderAccountId,
      prewarm,
    });
  const setTraitsMutation = useMutation(
    api.sessionChats.setTraits,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.sessionChats.get,
      { chatId: args.chatId },
      (cur) => cur && { ...cur, ...composerTraitFields(args) },
    );
  });

  const model = normalizeAIModel(chat?.lastModel ?? defaultModel);

  const setModel = (nextModel: AIModel) => {
    void withSessionChat(chatSource, (chatId) =>
      setModelMutation({ chatId, model: normalizeAIModel(nextModel) }),
    );
  };

  const setTraits = (partial: Partial<StoredModelTraits>) => {
    void withSessionChat(chatSource, (chatId) =>
      setTraitsMutation({ chatId, ...toRunTraitArgs(partial) }),
    );
  };

  return {
    chat,
    model,
    setModel,
    traits: storedComposerTraits(chat),
    setTraits,
    providerAccountId:
      chat === undefined ? undefined : (chat?.providerAccountId ?? null),
    setProviderAccountId: switchProviderAccount,
    isSwitchingAccount,
    persistProviderAccountId,
    prewarm,
  };
}
