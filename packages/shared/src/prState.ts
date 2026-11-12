import type { Doc } from "@eva/backend";

/** Lifecycle of a pull request Eva tracks (the backend `prStateValidator`). */
export type PrState = Doc<"pullRequests">["state"];

/** A PR that is still open or draft. */
export type LivePrState = Extract<PrState, "draft" | "open">;

/** True for a PR that is still open or draft. */
export function isLivePrState(
  state: PrState | undefined,
): state is LivePrState {
  return state === "draft" || state === "open";
}

/**
 * Colour tone of a PR icon. Each surface maps a tone to its own colour: the
 * web to a `text-*` class, the phone to an `EVA_THEME` value.
 */
export type PrStateTone = "success" | "codeReview" | "destructive" | "muted";

/** Short state name for a PR icon's title, "PR" when the state is unknown. */
export function prStateLabel(state: PrState | undefined): string {
  switch (state) {
    case "open":
      return "Open";
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    case "draft":
      return "Draft";
    default:
      return "PR";
  }
}

/** Open is green, merged is the code-review purple, closed is red; else muted. */
export function prStateTone(state: PrState | undefined): PrStateTone {
  switch (state) {
    case "open":
      return "success";
    case "merged":
      return "codeReview";
    case "closed":
      return "destructive";
    default:
      return "muted";
  }
}
