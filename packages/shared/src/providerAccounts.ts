import type { AIProvider, Id } from "@eva/backend";

/**
 * The model picker's provider accounts (the user's own, and teammates' shared
 * ones), as the web and phone pickers list them. Pure, so both apps pick the
 * same default.
 */

/** One account row of the picker. */
export interface PickerAccount {
  id: Id<"userProviderAccounts">;
  provider: AIProvider;
  label: string;
  /** Owned by whoever the run bills to, not a teammate's shared account. */
  isOwn: boolean;
}

/**
 * `userProviderAccounts.list*` rows → picker rows, most recently updated
 * first, so a default prefers the latest.
 */
export function toPickerAccounts(
  accounts: ReadonlyArray<{
    _id: Id<"userProviderAccounts">;
    provider: AIProvider;
    label: string;
    isOwn: boolean;
    updatedAt: number;
  }>,
): PickerAccount[] {
  // A copy, as `toSorted` is missing in some Hermes release builds.
  return [...accounts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((account) => ({ id: account._id, provider: account.provider, label: account.label, isOwn: account.isOwn }));
}

type SelectableAccount = { id: string; provider: string; isOwn: boolean };

/**
 * Creator default: the creator's OWN account for `provider` (the first listed
 * wins, so sort by `updatedAt` desc), else null (Team). Teammates' shared
 * accounts bill their owner, so they are never defaulted to.
 */
export function defaultAccountForProvider<T extends SelectableAccount>(
  accounts: ReadonlyArray<T>,
  provider: string,
): T["id"] | null {
  return accounts.find((account) => account.isOwn && account.provider === provider)?.id ?? null;
}

/**
 * The account to carry over when the model changes: the current pick when it
 * is for the new model's `provider` (an explicit choice survives a model
 * switch), else the creator default.
 */
export function carriedAccountForProvider<T extends SelectableAccount>(
  accounts: ReadonlyArray<T>,
  currentAccountId: string | null,
  provider: string,
): T["id"] | null {
  const current = accounts.find((account) => account.id === currentAccountId);
  if (current && current.provider === provider) return current.id;
  return defaultAccountForProvider(accounts, provider);
}
