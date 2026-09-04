import { describe, expect, test } from "vitest";
import {
  usageLimitResetClock,
  usageLimitResetText,
  usageLimitRetryCandidates,
} from "./usageLimitBanner";

/**
 * The recovery banner repeats the provider's own reset hint back to the user,
 * so a wrong extraction either drops the one piece of information that says
 * whether waiting is cheaper than switching accounts, or pastes the whole
 * error string into a one-line banner.
 */
describe("usageLimitResetText", () => {
  test("keeps the reset fragment out of a session-limit failure", () => {
    expect(
      usageLimitResetText(
        "Error: You've hit your session limit · resets 12pm (UTC)",
      ),
    ).toBe("resets 12pm (UTC)");
  });

  test("reads the parenthesis-free wording too", () => {
    expect(
      usageLimitResetText("Error: out of extra usage · resets 4:30pm UTC"),
    ).toBe("resets 4:30pm UTC");
  });

  test("an error with no reset hint yields nothing to show", () => {
    // The banner still renders — it just omits the ` · resets …` clause rather
    // than inventing a time the provider never gave.
    expect(
      usageLimitResetText("Error: Claude usage limit reached"),
    ).toBeUndefined();
  });
});

/**
 * The card leads with its own countdown, so the provider's wall-clock time is
 * shown as a parenthetical. Leaving "resets" or the brackets in would read
 * "Resets in 2h 10m (resets 12pm (UTC))".
 */
describe("usageLimitResetClock", () => {
  test("drops the verb and the brackets", () => {
    expect(
      usageLimitResetClock(
        "Error: You've hit your session limit · resets 12pm (UTC)",
      ),
    ).toBe("12pm UTC");
  });

  test("leaves already-bare wording alone", () => {
    expect(
      usageLimitResetClock("Error: out of extra usage · resets 4:30pm UTC"),
    ).toBe("4:30pm UTC");
  });

  test("no reset hint means no parenthetical", () => {
    expect(
      usageLimitResetClock("Error: Claude usage limit reached"),
    ).toBeUndefined();
  });
});

/**
 * Every row in the card is a credential the retry will actually run on, so a
 * wrong list either offers the exhausted account back (which fails again), an
 * account for a provider this chat is not using, or spends the shared team
 * credential when a personal one would have done.
 */
describe("usageLimitRetryCandidates", () => {
  const accounts = [
    { id: "acc_priya", provider: "claude", label: "Priya", isOwn: false },
    { id: "acc_sam", provider: "claude", label: "Sam", isOwn: true },
    { id: "acc_codex", provider: "codex", label: "Sam", isOwn: true },
  ];

  test("excludes the account that just ran out, and other providers", () => {
    const candidates = usageLimitRetryCandidates({
      accounts,
      provider: "claude",
      currentAccountId: "acc_sam",
    });
    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "acc_priya",
      "team",
    ]);
    expect(candidates[0]).toEqual({
      key: "acc_priya",
      name: "Priya",
      accountId: "acc_priya",
      isOwn: false,
    });
  });

  test("team is last, after every personal account", () => {
    const candidates = usageLimitRetryCandidates({
      accounts,
      provider: "claude",
      currentAccountId: "acc_missing",
    });
    expect(candidates.map((candidate) => candidate.accountId)).toEqual([
      "acc_priya",
      "acc_sam",
      null,
    ]);
  });

  test("the team credential is not offered back to itself", () => {
    const candidates = usageLimitRetryCandidates({
      accounts,
      provider: "claude",
      currentAccountId: null,
    });
    expect(candidates.map((candidate) => candidate.key)).toEqual([
      "acc_priya",
      "acc_sam",
    ]);
  });
});
