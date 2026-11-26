import { expect, test } from "bun:test";
import { isSandboxNetworkIssue } from "../convex/_sandbox/networkIssue";
import {
  isUsageLimitError,
  parseUsageLimitResetTime,
} from "../convex/_queues/usageLimitReset";

test("isSandboxNetworkIssue requires sandbox/snapshot marker plus network/status", () => {
  expect(isSandboxNetworkIssue("Sandbox timed out: status code 503")).toBe(
    true,
  );
  expect(
    isSandboxNetworkIssue(
      "sandbox failed to become ready within the timeout period",
    ),
  ).toBe(true);
  expect(isSandboxNetworkIssue("plain fetch failed with econnreset")).toBe(
    false,
  );
});

test("isSandboxNetworkIssue ignores sandbox exec failures and base-branch fetch", () => {
  // Agent command failures must not trigger infrastructure auto-retry.
  expect(isSandboxNetworkIssue("sandbox exec failed: command not found")).toBe(
    false,
  );
  expect(
    isSandboxNetworkIssue("Failed to fetch latest base branch from remote"),
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
