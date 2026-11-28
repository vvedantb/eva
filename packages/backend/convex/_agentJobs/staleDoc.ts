import type { Doc } from "../_generated/dataModel";

type StaleDocFields = Pick<
  Doc<"docs">,
  "testGenStatus" | "prRecapStatus" | "interviewHistory"
>;

type StaleDocPatch = {
  activeWorkflowId: undefined;
  testGenStatus?: "error";
  prRecapStatus?: "error";
  prRecapError?: string;
  updatedAt?: number;
  interviewHistory?: Doc<"docs">["interviewHistory"];
};

/**
 * Decide how a stale doc workflow unwinds once its run has been cancelled. Kept
 * pure (no ctx, no db) so the recovery rules can be unit-tested directly.
 *
 * A recap left "pending" is unrecoverable from the UI — the panel hides Generate
 * while pending — so a timed-out workflow must land on "error" with a message.
 * A running test-gen job flips to "error"; a dangling empty assistant turn in
 * the interview history is marked so the chat stops hanging on it.
 */
export function buildStaleDocPatch(
  doc: StaleDocFields,
  now: number,
): StaleDocPatch {
  const patch: StaleDocPatch = { activeWorkflowId: undefined };

  if (doc.testGenStatus === "running") {
    patch.testGenStatus = "error";
  }

  if (doc.prRecapStatus === "pending") {
    patch.prRecapStatus = "error";
    patch.prRecapError = "Recap generation timed out";
    patch.updatedAt = now;
  }

  if (doc.interviewHistory && doc.interviewHistory.length > 0) {
    const history = [...doc.interviewHistory];
    const last = history[history.length - 1];
    if (last && last.role === "assistant" && !last.content) {
      last.content = JSON.stringify({ error: true });
    }
    patch.interviewHistory = history;
  }

  return patch;
}
