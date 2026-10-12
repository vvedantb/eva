import { describe, expect, test } from "vitest";
import { isRetryableGitNetworkError } from "../convex/_sandbox_runtime/git";

/**
 * Session 300 (7 Oct 2026): GitHub answered a push with a 500 and the whole
 * publish failed on the first try (fix #918). The push and fetch retry loops
 * only retry what this classifier matches, so it must catch GitHub's real 5xx
 * shapes — and must NOT widen to refusals a retry can never fix.
 */
describe("retryable git network errors", () => {
  test.each([
    [
      "push remote rejected with a GitHub 500",
      "To https://github.com/evalucom/eva.git\n ! [remote rejected] refs/heads/eva/x -> eva/x (Internal Server Error)\nerror: failed to push some refs to 'https://github.com/evalucom/eva.git'",
    ],
    ["an HTTP-status 500", "fatal: unable to access: status code 500"],
  ])("retries %s", (_label, message) => {
    expect(isRetryableGitNetworkError(message)).toBe(true);
  });

  test.each([
    [
      "protected branch hook",
      " ! [remote rejected] main -> main (protected branch hook declined)\nerror: failed to push some refs",
    ],
    [
      "missing workflow scope",
      " ! [remote rejected] eva/x -> eva/x (refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission)",
    ],
    [
      "file over GitHub's size limit",
      "remote: error: File big.bin is 120.00 MB; this exceeds GitHub's file size limit of 100.00 MB\n ! [remote rejected] eva/x -> eva/x (pre-receive hook declined)",
    ],
    ["missing remote ref", "fatal: couldn't find remote ref eva/x"],
  ])("does not retry %s", (_label, message) => {
    expect(isRetryableGitNetworkError(message)).toBe(false);
  });
});
