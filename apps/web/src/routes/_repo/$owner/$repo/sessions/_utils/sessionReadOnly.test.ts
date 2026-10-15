import { describe, expect, test } from "vitest";
import {
  canSendSessionForReview,
  getSessionReadOnlyMessage,
  isSessionSidebarActive,
  type SessionPrState,
} from "./sessionReadOnly";

describe("session read-only state", () => {
  test("archive removes a session from Active", () => {
    expect(isSessionSidebarActive({ archived: true })).toBe(false);
  });

  test("a non-archived session stays active whatever its PR state", () => {
    expect(isSessionSidebarActive({})).toBe(true);
    expect(isSessionSidebarActive({ archived: false })).toBe(true);
  });

  test.each<SessionPrState>(["merged", "closed"])(
    "a %s PR kept live (auto-archive off) shows no read-only banner",
    (prState) => {
      expect(
        getSessionReadOnlyMessage({ isArchived: false, prState }),
      ).toBeUndefined();
    },
  );

  test("terminal PR reason wins over the generic archive message", () => {
    expect(
      getSessionReadOnlyMessage({ isArchived: true, prState: "merged" }),
    ).toContain("merged");
    expect(
      getSessionReadOnlyMessage({ isArchived: true, prState: "closed" }),
    ).toContain("closed");
  });

  test("send for review needs a branch and a PR not already out for review", () => {
    expect(canSendSessionForReview({ branchName: "eva/x" })).toBe(true);
    expect(
      canSendSessionForReview({ branchName: "eva/x", prState: "draft" }),
    ).toBe(true);
    expect(canSendSessionForReview({})).toBe(false);
  });

  test.each<SessionPrState>(["open", "merged", "closed"])(
    "%s PR is past send for review",
    (prState) => {
      expect(canSendSessionForReview({ branchName: "eva/x", prState })).toBe(
        false,
      );
    },
  );

  test("manual archive has its own fallback and live sessions have none", () => {
    expect(
      getSessionReadOnlyMessage({ isArchived: true, prState: "open" }),
    ).toContain("archived");
    expect(
      getSessionReadOnlyMessage({ isArchived: false, prState: "open" }),
    ).toBeUndefined();
  });
});
