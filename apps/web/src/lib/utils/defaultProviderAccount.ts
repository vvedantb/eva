import { getAIModelProvider, type AIProvider } from "@eva/backend";
import type { ModelAccount } from "@eva/ui";

type SelectableAccount = Pick<ModelAccount, "id" | "provider" | "isOwn">;

/**
 * Creator default: the creator's OWN account matching the model's provider
 * (most recently listed wins — caller should sort by updatedAt desc), else null
 * (Team). Teammates' shared accounts bill their owner, so they are never
 * defaulted to — they have to be picked explicitly.
 */
export function defaultProviderAccountId(
  accounts: ReadonlyArray<SelectableAccount>,
  model: string | null | undefined,
): string | null {
  const provider: AIProvider = getAIModelProvider(model);
  for (const account of accounts) {
    if (account.isOwn && account.provider === provider) return account.id;
  }
  return null;
}

/**
 * The account to carry over when the model changes: the current pick when it
 * still matches the new model's provider (an explicit choice survives a model
 * switch), else the creator default.
 */
export function providerAccountIdForModel(
  accounts: ReadonlyArray<SelectableAccount>,
  currentAccountId: string | null,
  model: string | null | undefined,
): string | null {
  const current = accounts.find((account) => account.id === currentAccountId);
  if (current && current.provider === getAIModelProvider(model)) {
    return current.id;
  }
  return defaultProviderAccountId(accounts, model);
}
