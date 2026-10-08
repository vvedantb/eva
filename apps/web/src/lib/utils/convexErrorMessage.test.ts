import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import {
  convexErrorMessage,
  userFacingErrorMessage,
} from "./convexErrorMessage";

/**
 * Production Convex redacts the message of a plain `Error` to "Server Error",
 * so a failed Create PR reached the user as a request id and nothing else —
 * on the very button offered as the recovery path for a run whose own PR step
 * failed. Only `ConvexError` data crosses the wire intact (fix aea40f89).
 */
describe("convexErrorMessage", () => {
  test("prefers the ConvexError data that survived the wire", () => {
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
});

/**
 * Form error slots showed the raw client rejection — request id, envelope and
 * stack frame — so the one sentence the handler threw was the least readable
 * part of it.
 */
describe("userFacingErrorMessage", () => {
  test("keeps only the thrown sentence from a wrapped client rejection", () => {
    const error = new Error(
      "[CONVEX M(teams:create)] [Request ID: abc] Server Error\n" +
        "Uncaught Error: Team name is required\n" +
        "    at handler (../convex/teams.ts:107:12)",
    );
    expect(userFacingErrorMessage(error, "Couldn't create team")).toBe(
      "Team name is required",
    );
  });

  test("cuts an inline stack frame off a single-line message", () => {
    expect(
      userFacingErrorMessage(
        "Uncaught Error: User not found at handler (../convex/teamMembers.ts:167:13)",
        "Couldn't add member",
      ),
    ).toBe("User not found");
  });

  test("falls back when only the client's envelope survives", () => {
    expect(
      userFacingErrorMessage(
        "[CONVEX M(teams:create)] [Request ID: abc] Server Error",
        "Couldn't create team",
      ),
    ).toBe("Couldn't create team");
    expect(userFacingErrorMessage(null, "Couldn't create team")).toBe(
      "Couldn't create team",
    );
  });
});
