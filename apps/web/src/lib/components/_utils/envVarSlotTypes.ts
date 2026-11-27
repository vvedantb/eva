import type { ComponentType } from "react";

interface ProviderLogoProps {
  size?: number;
  className?: string;
}

/** Shared shape for coding-agent and infrastructure env paste-in slots. */
export interface EnvVarSlotEntry {
  /** Stable id for React keys and local draft state. */
  id: string;
  label: string;
  primaryKey: string;
  matchKeys: ReadonlyArray<string>;
  Logo: ComponentType<ProviderLogoProps>;
  hint: string;
  placeholder: string;
  multiline: boolean;
  /** When true, slot is hidden on the team env tab (repo-only keys). */
  repoOnly?: boolean;
  /**
   * When set, overrides the slots component's `defaultSandboxExclude` for
   * new upserts from this slot (e.g. deploy keys stay out of sandboxes).
   */
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
