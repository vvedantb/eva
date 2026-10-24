import type { ModelAccount } from "@vvedantb/ui";

/** Client-side snapshot matching backend `resolveCredentialSourceLabel`. */
export function resolveCredentialSourceLabel(
  providerAccountId: string | null | undefined,
  accounts: ReadonlyArray<Pick<ModelAccount, "id" | "label">>,
): string {
  if (!providerAccountId) return "Team";
  const account = accounts.find((entry) => entry.id === providerAccountId);
  const label = account?.label.trim();
  return label && label.length > 0 ? label : "Team";
}
