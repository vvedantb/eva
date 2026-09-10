import { expect, test } from "vitest";
import {
  isDaytonaNetworkIssue,
  isUsageLimitError,
  parseUsageLimitResetTime,
} from "../convex/_taskWorkflow/recovery";

test("isDaytonaNetworkIssue requires daytona/sandbox marker plus network/status", () => {
  expect(
    isDaytonaNetworkIssue("Daytona sandbox timed out: status code 503"),
  ).toBe(true);
  expect(
    isDaytonaNetworkIssue(
      "sandbox failed to become ready within the timeout period",
    ),
  ).toBe(true);
  expect(isDaytonaNetworkIssue("plain fetch failed with econnreset")).toBe(
    false,
  );
});

test("isDaytonaNetworkIssue ignores sandbox exec failures and base-branch fetch", () => {
  // Agent command failures must not trigger infrastructure auto-retry.
  expect(isDaytonaNetworkIssue("sandbox exec failed: command not found")).toBe(
    false,
  );
  expect(
    isDaytonaNetworkIssue("Failed to fetch latest base branch from remote"),
  ).toBe(false);
});

test("isUsageLimitError matches Claude usage/rate limit copy", () => {
  expect(
    isUsageLimitError("You're out of extra usage · resets 4pm (UTC)"),
  ).toBe(true);
  expect(isUsageLimitError("rate limit exceeded")).toBe(true);
  expect(isUsageLimitError("You've hit your individual spend limit")).toBe(
    true,
  );
  expect(
    isUsageLimitError("You've hit your session limit · resets 12pm (UTC)"),
  ).toBe(true);
  expect(isUsageLimitError("sandbox timed out")).toBe(false);
});

test("parseUsageLimitResetTime parses UTC reset clock and advances past times", () => {
  const parsed = parseUsageLimitResetTime(
    "You're out of extra usage · resets 4pm (UTC)",
  );
  expect(parsed).not.toBeNull();
  if (parsed === null) return;
  expect(parsed).toBeGreaterThan(Date.now() - 60_000);

  expect(parseUsageLimitResetTime("no reset info here")).toBeNull();
});
