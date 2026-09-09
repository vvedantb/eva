import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import {
  convexErrorMessage,
  convexErrorPresentation,
  convexErrorTag,
  errorToneClassName,
} from "./convexErrorMessage";

/**
 * Production Convex redacts the message of a plain `Error` to "Server Error",
 * so a failed Create PR reached the user as a request id and nothing else —
 * on the very button offered as the recovery path for a run whose own PR step
 * failed. Only `ConvexError` data crosses the wire intact (fix aea40f89).
 */
describe("convexErrorMessage", () => {
  test("reads the message out of a structured payload", () => {
    expect(
      convexErrorMessage(
        new ConvexError({
          tag: "GitHubBranchNotAhead",
          message: "eva/task-12 is not ahead of staging",
        }),
        "Failed to create PR",
      ),
    ).toBe("eva/task-12 is not ahead of staging");
  });

  test("prefers the legacy string ConvexError data that survived the wire", () => {
    expect(
      convexErrorMessage(
        new ConvexError("eva/task-12 is not ahead of staging"),
        "Failed to create PR",
      ),
    ).toBe("eva/task-12 is not ahead of staging");
  });

  test("keeps a plain Error's own message", () => {
    expect(
      convexErrorMessage(new Error("Not authenticated"), "Failed to create PR"),
    ).toBe("Not authenticated");
  });

  test("falls back only when the failure carries no message at all", () => {
    expect(convexErrorMessage("boom", "Failed to create PR")).toBe(
      "Failed to create PR",
    );
    expect(convexErrorMessage(undefined, "Failed to create PR")).toBe(
      "Failed to create PR",
    );
  });

  /**
   * Data that does not match the contract is not a payload, so these fall
   * through to `Error.message` exactly as they did before payloads existed —
   * `ConvexError` stringifies non-string data into its own message.
   */
  describe("data that is not a payload", () => {
    test("an object missing message", () => {
      expect(
        convexErrorMessage(
          new ConvexError({ tag: "GitHubBranchNotAhead" }),
          "Failed to create PR",
        ),
      ).toBe('{"tag":"GitHubBranchNotAhead"}');
    });

    test("a number", () => {
      expect(
        convexErrorMessage(new ConvexError(42), "Failed to create PR"),
      ).toBe("42");
    });

    test("an empty tag", () => {
      expect(
        convexErrorMessage(
          new ConvexError({ tag: "", message: "Boom" }),
          "Failed to create PR",
        ),
      ).toBe('{"tag":"","message":"Boom"}');
    });
  });
});

describe("convexErrorTag", () => {
  test("reads the backend error's _tag off a structured payload", () => {
    expect(
      convexErrorTag(
        new ConvexError({
          tag: "GitHubBranchNotAhead",
          message: "eva/task-12 is not ahead of staging",
        }),
      ),
    ).toBe("GitHubBranchNotAhead");
  });

  test("is undefined for anything without a payload", () => {
    expect(
      convexErrorTag(new ConvexError("plain string data")),
    ).toBeUndefined();
    expect(
      convexErrorTag(new ConvexError({ tag: "GitHubBranchNotAhead" })),
    ).toBeUndefined();
    expect(
      convexErrorTag(new ConvexError({ tag: "", message: "Boom" })),
    ).toBeUndefined();
    expect(convexErrorTag(new ConvexError(42))).toBeUndefined();
    expect(convexErrorTag(new Error("Not authenticated"))).toBeUndefined();
    expect(convexErrorTag("boom")).toBeUndefined();
    expect(convexErrorTag(undefined)).toBeUndefined();
  });
});

/**
 * "Nothing to do" is not a fault: a plan-only turn ends with a branch that has
 * no commits, so Create PR failing there is the expected outcome and must not
 * read as a red error.
 */
describe("convexErrorPresentation", () => {
  const infoTags = [
    "GitHubBranchNotAhead",
    "GitHubPullRequestAlreadyExists",
    "RecapAuthorNotRecapped",
    "RecapPrUrlInvalid",
  ];

  test.each(infoTags)("%s is an outcome, not a failure", (tag) => {
    expect(
      convexErrorPresentation(
        new ConvexError({ tag, message: "Nothing to do" }),
        "Failed to create PR",
      ),
    ).toEqual({ message: "Nothing to do", tone: "info" });
  });

  test("any other tag is a real failure", () => {
    expect(
      convexErrorPresentation(
        new ConvexError({
          tag: "GitNetworkError",
          message: "Could not reach GitHub",
        }),
        "Failed to create PR",
      ),
    ).toEqual({ message: "Could not reach GitHub", tone: "error" });
  });

  test("an unknown tag is a real failure", () => {
    expect(
      convexErrorPresentation(
        new ConvexError({ tag: "SomeTagAddedLater", message: "Boom" }),
        "Failed to create PR",
      ),
    ).toEqual({ message: "Boom", tone: "error" });
  });

  test("legacy string data carries no tag, so it is a failure", () => {
    expect(
      convexErrorPresentation(
        new ConvexError("eva/task-12 is not ahead of staging"),
        "Failed to create PR",
      ),
    ).toEqual({
      message: "eva/task-12 is not ahead of staging",
      tone: "error",
    });
  });

  test("a plain Error is a failure and keeps its message", () => {
    expect(
      convexErrorPresentation(
        new Error("Not authenticated"),
        "Failed to create PR",
      ),
    ).toEqual({ message: "Not authenticated", tone: "error" });
  });

  test("a throw with no message falls back and stays a failure", () => {
    expect(convexErrorPresentation("boom", "Failed to create PR")).toEqual({
      message: "Failed to create PR",
      tone: "error",
    });
  });
});

describe("errorToneClassName", () => {
  test("maps tone to text colour only", () => {
    expect(errorToneClassName("info")).toBe("text-muted-foreground");
    expect(errorToneClassName("error")).toBe("text-destructive");
  });
});
