import { describe, expect, test } from "vitest";
import { usageLimitResetText } from "./usageLimitBanner";

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
