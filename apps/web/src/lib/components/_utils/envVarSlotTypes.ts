import type { ComponentType } from "react";

interface ProviderLogoProps {
  size?: number;
  className?: string;
}

/** Shared shape for coding-agent and infrastructure env paste-in slots. */
export interface EnvVarSlotEntry {
  id: string;
  label: string;
  primaryKey: string;
  matchKeys: ReadonlyArray<string>;
  Logo: ComponentType<ProviderLogoProps>;
  hint: string;
  placeholder: string;
  multiline: boolean;
  repoOnly?: boolean;
  sandboxExclude?: boolean;
}

export type EnvVarScope = "repo" | "team";

export function filterSlotsForScope(
  entries: ReadonlyArray<EnvVarSlotEntry>,
  scope: EnvVarScope,
): ReadonlyArray<EnvVarSlotEntry> {
  if (scope === "repo") return entries;
  return entries.filter((entry) => entry.repoOnly !== true);
}

export function slotEnvVarKeys(
  entries: ReadonlyArray<EnvVarSlotEntry>,
): ReadonlySet<string> {
  return new Set(entries.flatMap((entry) => entry.matchKeys));
}
