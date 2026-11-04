import { describe, expect, test } from "vitest";
import { classifyGitFailure } from "../convex/_git/gitErrors";
import { SandboxCommandFailedError } from "../convex/_sandbox_runtime/sandboxErrors";

/**
 * Prod (2026-09-01): sandbox:fetchBaseBranch threw Uncaught
 * SandboxCommandFailedError for a deleted eva/automation-* ref. Git exit 128
 * "couldn't find remote ref" is expected, not a function failure.
 */
describe("missing remote ref is a handled git outcome", () => {
  const axiomFingerprint =
    "Uncaught SandboxCommandFailedError: Sandbox command failed (exit 128): fatal: couldn't find remote ref eva/automation-ts7a18s257e0ktzfcvj416b0ts8b3jsw-tn71c3mydagm4hfstgd8sxrxy58dj636";

  test("matches the prod fingerprint and British/American git wording", () => {
    expect(classifyGitFailure(new Error(axiomFingerprint))._tag).toBe(
      "GitMissingRemoteRefError",
    );
    expect(
      classifyGitFailure(new Error("fatal: could not find remote ref main"))
        ._tag,
    ).toBe("GitMissingRemoteRefError");
    expect(
      classifyGitFailure(new Error("Sandbox command failed (exit 1): boom"))
        ._tag,
    ).toBe("GitCommandError");
  });

  test("recognises the typed sandbox command error, not a network failure", () => {
    const missing = new SandboxCommandFailedError({
      message:
        "Sandbox command failed (exit 128): fatal: couldn't find remote ref eva/automation-dead",
      exitCode: 128,
      output: "fatal: couldn't find remote ref eva/automation-dead",
    });
    expect(classifyGitFailure(missing)._tag).toBe("GitMissingRemoteRefError");
    expect(
      classifyGitFailure(
        new SandboxCommandFailedError({
          message:
            "Sandbox command failed (exit 128): fatal: Authentication failed",
          exitCode: 128,
          output: "fatal: Authentication failed",
        }),
      )._tag,
    ).toBe("GitNetworkError");
  });
});
