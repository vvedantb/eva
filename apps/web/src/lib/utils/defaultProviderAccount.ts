import { getAIModelProvider } from "@eva/backend";
import { carriedAccountForProvider, defaultAccountForProvider } from "@eva/shared";

type SelectableAccount = { id: string; provider: string; isOwn: boolean };

/**
 * Creator default for `model` (`defaultAccountForProvider`): the creator's OWN
 * account for its provider, else null (Team). A missing model is Claude's.
 */
export function defaultProviderAccountId(
  accounts: ReadonlyArray<SelectableAccount>,
  model: string | null | undefined,
): string | null {
  return defaultAccountForProvider(accounts, getAIModelProvider(model));
}

/** The account to carry over to `model` (`carriedAccountForProvider`). */
export function providerAccountIdForModel(
  accounts: ReadonlyArray<SelectableAccount>,
  currentAccountId: string | null,
  model: string | null | undefined,
): string | null {
  return carriedAccountForProvider(accounts, currentAccountId, getAIModelProvider(model));
}
