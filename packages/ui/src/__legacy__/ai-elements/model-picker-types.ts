export interface ModelOption<TModel extends string = string> {
  id: TModel;
  provider: string;
  label: string;
}

/** A provider account the viewer can run on, surfaced as a group in the picker. */
export interface ModelAccount {
  id: string;
  provider: string;
  label: string;
  /**
   * Owned by whoever the run bills to, not a teammate's shared account. Only
   * own accounts may be picked automatically; a teammate's share is explicit.
   */
  isOwn: boolean;
}

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case "claude":
      return "Claude";
    case "codex":
      return "GPT";
    case "opencode":
      return "Opencode";
    case "cursor":
      return "Cursor";
    default:
      return provider;
  }
}

/** t3code-style list/trigger label: "Claude Opus", not bare "Opus". */
export function formatModelDisplayLabel(
  provider: string,
  label: string,
): string {
  // Codex models are already named "GPT …"; don't prefix with "Codex".
  if (provider === "codex") {
    return label;
  }
  const providerLabel = getProviderLabel(provider);
  if (label.toLowerCase().startsWith(providerLabel.toLowerCase())) {
    return label;
  }
  return `${providerLabel} ${label}`;
}

export function findModelOption<TModel extends string>(
  value: TModel,
  options: ReadonlyArray<ModelOption<TModel>>,
): ModelOption<TModel> | null {
  const option = options.find((entry) => entry.id === value);
  return option ?? options[0] ?? null;
}
