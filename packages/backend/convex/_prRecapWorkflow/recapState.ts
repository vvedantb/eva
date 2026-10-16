/**
 * The one definition of "this recap is really ready".
 *
 * `prRecapStatus: "ready"` cannot express that the walkthrough actually
 * arrived, so ready-with-no-walkthrough was a storable illegal state (a model
 * that returned narration instead of a walkthrough). A walkthrough is the
 * structured `recapWalkthrough` steps, or the HTML page older recaps stored. The write path now enforces the
 * invariant here, and the recap views read the same helper so a row written
 * before enforcement still renders as a failure rather than a blank tab.
 *
 * Dependency-free on purpose: imported by Convex mutations, by the workflow,
 * and by the web app through `@eva/backend`.
 */

type PrRecapStatus = "pending" | "ready" | "error";

/** The fields that can carry a walkthrough: structured steps, or legacy HTML. */
type RecapWalkthroughFields = {
  recapWalkthrough?: ReadonlyArray<object>;
  html?: string;
};

/** Stored on the recap doc when the model response is not a complete recap. */
export const INCOMPLETE_PR_RECAP_ERROR =
  "We couldn't generate a complete recap. Generate again to retry.";

/** Shown by the recap views for a doc that failed the ready invariant. */
export const INCOMPLETE_PR_RECAP_MESSAGE =
  "The walkthrough wasn't saved. Generate again to retry.";

/**
 * True when a run has stored a recap on this doc at some point. A later pending
 * or failed run keeps it, so this is the test for "is the content a real recap",
 * whatever the status says.
 */
export function hasStoredRecap(doc: RecapWalkthroughFields): boolean {
  if (doc.recapWalkthrough !== undefined && doc.recapWalkthrough.length > 0) {
    return true;
  }
  return doc.html !== undefined && doc.html.trim() !== "";
}

/**
 * A doc stored "ready" without a walkthrough — the illegal state this module
 * exists to name. New writes cannot produce it; older rows still can.
 */
export function isIncompleteReadyRecap(
  doc: RecapWalkthroughFields & { prRecapStatus?: PrRecapStatus },
): boolean {
  return doc.prRecapStatus === "ready" && !hasStoredRecap(doc);
}

/** A recap the reader can actually open: ready and carrying its walkthrough. */
export function isViewableRecap(
  doc: RecapWalkthroughFields & { prRecapStatus?: PrRecapStatus },
): boolean {
  return doc.prRecapStatus === "ready" && hasStoredRecap(doc);
}

/**
 * Normalises the status/error pair a write is about to store. "ready" without a
 * walkthrough becomes an error so the doc never claims a recap it cannot show;
 * a genuine "ready" drops any stale error text.
 */
export function resolvePrRecapWrite(
  input: RecapWalkthroughFields & {
    prRecapStatus: PrRecapStatus;
    prRecapError: string | undefined;
  },
): { prRecapStatus: PrRecapStatus; prRecapError: string | undefined } {
  if (input.prRecapStatus === "ready") {
    return hasStoredRecap(input)
      ? { prRecapStatus: "ready", prRecapError: undefined }
      : {
          prRecapStatus: "error",
          prRecapError: input.prRecapError ?? INCOMPLETE_PR_RECAP_ERROR,
        };
  }
  return {
    prRecapStatus: input.prRecapStatus,
    prRecapError: input.prRecapError,
  };
}
