import { prStateTone, type PrState, type PrStateTone } from "@eva/shared";

/** The web class for each shared PR icon tone. */
const PR_STATE_TONE_CLASS: Record<PrStateTone, string> = {
  success: "text-success",
  codeReview: "text-status-code-review",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

/** Maps a PR state to its icon colour class (via the shared `prStateTone`). */
export function prStateIconClass(state: PrState | undefined): string {
  return PR_STATE_TONE_CLASS[prStateTone(state)];
}
