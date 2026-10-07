import { describe, expect, test } from "vitest";
import { pendingTurnAlreadyClaimed } from "../convex/_chat/pendingTurnRestage";

/**
 * Task and project chat have no `turns` row, so `ensurePendingTurn` could not
 * tell "the daemon claimed this prompt and is running it" from "a cancel raced
 * `startExecute` and wiped it": both leave no `pendingTurn` and an unfinished
 * assistant placeholder as the newest message. It re-staged mid-turn, and
 * because `shouldDeferDaemonRespawn` never defers while a prompt is staged, a
 * prewarm killed the daemon, the replacement claimed the duplicate, and one
 * user message ran twice in parallel (task m57bzd0wbdtnm57e2g4jfb17718b5yty,
 * 2026-09-02 13:11).
 */
describe("pendingTurnAlreadyClaimed", () => {
  const PLACEHOLDER_AT = 1_800_000_000_000;

  /** No daemon has ever claimed here, so an empty pendingTurn means cancel. */
  test("an unstamped entity is a cancel race, not a live claim", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: undefined,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(false);
  });

  /** A stamp from an older turn cannot vouch for this turn's placeholder. */
  test("a stamp older than the placeholder is stale", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT - 1,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(false);
  });

  test("a stamp after the placeholder means the turn is running", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT + 1,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(true);
  });

  /**
   * `startExecute` inserts the placeholder and stages the prompt in one
   * mutation, so a claim can land on the same millisecond as the placeholder.
   * Treating that as unclaimed would re-open the duplicate-run window.
   */
  test("a stamp equal to the placeholder counts as claimed", () => {
    expect(
      pendingTurnAlreadyClaimed({
        pendingTurnClaimedAt: PLACEHOLDER_AT,
        placeholderTimestamp: PLACEHOLDER_AT,
      }),
    ).toBe(true);
  });
});
