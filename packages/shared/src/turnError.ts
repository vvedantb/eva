import { getAIModelProvider, type Doc } from "@eva/backend";

/** The failure text without the harness's `Error: ` stamp, which the notice's icon and title already say. */
export function stripErrorPrefix(content: string): string {
  const trimmed = content.trim();
  const prefix = /^error:\s*/i.exec(trimmed);
  return prefix === null ? trimmed : trimmed.slice(prefix[0].length);
}

/**
 * The heading a failed turn is announced with, or null when the turn is not a
 * failure. A usage limit belongs to whichever provider ran the turn, so the
 * title reads that turn's model stamp (`providerLabel` names it, from each
 * app's kit); an unstamped legacy turn names no provider rather than guessing.
 */
export function turnErrorTitle({
  errorType,
  turnModel,
  messageModel,
  providerLabel,
}: {
  errorType: Doc<"messages">["errorType"];
  turnModel: string | undefined;
  messageModel: string | undefined;
  providerLabel: (provider: string) => string;
}): string | null {
  if (errorType === "generic") return "This turn failed";
  if (errorType !== "rate_limit") return null;
  const model = turnModel ?? messageModel;
  if (model === undefined) return "Usage limit reached";
  return `${providerLabel(getAIModelProvider(model))} usage limit reached`;
}
