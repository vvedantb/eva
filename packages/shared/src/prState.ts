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
 * One state for a change that spans several repos, from each repo's PR state
 * (a task with linked repos). Open while any PR is open (draft while the live
 * ones are all drafts); merged once every PR merged; else closed. With one
 * repo it is that repo's state. Undefined when no repo has a PR.
 */
export function combineRepoPrStates(
  states: readonly PrState[],
): PrState | undefined {
  if (states.length === 0) return undefined;
  if (states.includes("open")) return "open";
  if (states.includes("draft")) return "draft";
  return states.every((state) => state === "merged") ? "merged" : "closed";
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

/**
 * A chat's PRs as its "…" menu lists them: open and draft first. The sort is
 * stable, so `pullRequests.listForOwner`'s order (primary, then newest) holds
 * inside each half.
 */
export function orderPrsLiveFirst<T extends { state: PrState }>(prs: readonly T[]): T[] {
  return [...prs].sort((a, b) => Number(isLivePrState(b.state)) - Number(isLivePrState(a.state)));
}

/**
 * The repo a row names in a chat's PR list: "owner/name" on every row once
 * the list spans several repos (a multi-repo session or task), none while
 * all its PRs are in one repo.
 */
export function pullRequestRepoLabel(
  pr: { repoOwner: string; repoName: string },
  prs: readonly { repoId: string }[],
): string | undefined {
  return new Set(prs.map((row) => row.repoId)).size > 1
    ? `${pr.repoOwner}/${pr.repoName}`
    : undefined;
}

/** The menu entry that holds a chat's PRs when it has more than one. */
export function pullRequestsMenuLabel(count: number): string {
  return `Pull requests (${count})`;
}
