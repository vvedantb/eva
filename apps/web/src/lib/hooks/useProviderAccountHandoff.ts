"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";

/**
 * Persist a newly picked provider account, then wait for the replacement
 * chat daemon before the composer unlocks. Shared by project, task, and
 * session chat so an account switch cannot send on the previous credential.
 */
export function useProviderAccountHandoff(args: {
  persist: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => Promise<unknown>;
  prewarm: () => Promise<unknown>;
}): {
  isSwitchingAccount: boolean;
  switchProviderAccount: (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ) => Promise<void>;
} {
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  const switchProviderAccount = (
    providerAccountId: Id<"userProviderAccounts"> | null,
  ): Promise<void> => {
    return (async () => {
      setIsSwitchingAccount(true);
      try {
        await args.persist(providerAccountId);
        await args.prewarm();
      } catch (error) {
        setIsSwitchingAccount(false);
        throw error;
      }
      setIsSwitchingAccount(false);
    })();
  };

  return { isSwitchingAccount, switchProviderAccount };
}
