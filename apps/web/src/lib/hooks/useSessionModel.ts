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
 * Session composer prefs backed by Convex (`sessions.lastModel` / trait fields
 * / `providerAccountId`) as the source of truth. Read straight off the live
 * `sessions.get` query — no mirrored `useState` — so picks stay sticky across
 * reloads, tabs, and devices.
 *
 * Changes go through sticky setters with optimistic patches. While the session
 * query is still loading the picker shows `defaultModel`, model-default traits,
 * and Team account. Cached-hidden shells pass `active: false` so this does
 * not keep a second `sessions.get` live after SessionDetailClient skips it.
 */
export function useSessionModel(
  sessionId: Id<"sessions">,
  defaultModel: AIModel,
  active = true,
): {
  model: AIModel;
  setModel: (model: AIModel) => void;
  /** Sticky traits from Convex; undefined fields use model defaults. */
  traits: StoredModelTraits;
  setTraits: (partial: Partial<StoredModelTraits>) => void;
  /** undefined while session loading — treat as Team until the query lands. */
  providerAccountId: Id<"userProviderAccounts"> | null | undefined;
  /** Resolves once the replacement daemon is warm. */
  setProviderAccountId: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => Promise<void>;
  isSwitchingAccount: boolean;
} {
  const session = useHeldQuery(
    api.sessions.get,
    active ? { id: sessionId } : "skip",
  );
  const prewarmDaemonNow = useAction(api.sessionWorkflow.prewarmDaemonNow);
  const setModelMutation = useMutation(
    api.sessions.setModel,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessions.get, { id: args.id });
    if (!current) return;
    localStore.setQuery(
      api.sessions.get,
      { id: args.id },
      { ...current, lastModel: args.model },
    );
  });
  const setProviderAccountIdMutation = useMutation(
    api.sessions.setProviderAccountId,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessions.get, { id: args.id });
    if (!current) return;
    localStore.setQuery(
      api.sessions.get,
      { id: args.id },
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
        setProviderAccountIdMutation({ id: sessionId, providerAccountId }),
      prewarm: () => prewarmDaemonNow({ sessionId }),
    });
  const setTraitsMutation = useMutation(
    api.sessions.setTraits,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.sessions.get, { id: args.id });
    if (!current) return;
    localStore.setQuery(
      api.sessions.get,
      { id: args.id },
      {
        ...current,
        ...composerTraitFields(args),
      },
    );
  });

  const model = normalizeAIModel(session?.lastModel ?? defaultModel);

  const setModel = (nextModel: AIModel) => {
    void setModelMutation({
      id: sessionId,
      model: normalizeAIModel(nextModel),
    });
  };

  const setTraits = (partial: Partial<StoredModelTraits>) => {
    void setTraitsMutation({
      id: sessionId,
      ...toRunTraitArgs(partial),
    });
  };

  return {
    model,
    setModel,
    traits: storedComposerTraits(session),
    setTraits,
    providerAccountId:
      session === undefined ? undefined : (session?.providerAccountId ?? null),
    setProviderAccountId: switchProviderAccount,
    isSwitchingAccount,
  };
}
