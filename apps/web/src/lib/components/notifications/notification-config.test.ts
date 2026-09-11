import { describe, expect, test } from "vitest";
import { getNotificationAppearance } from "./notification-config";

describe("getNotificationAppearance", () => {
  test("session_archived from a merge names the PR outcome", () => {
    const appearance = getNotificationAppearance({
      type: "session_archived",
      title: 'PR #664 merged — "Fix login" archived',
      message: "Your session was archived because GitHub merged https://github.com/acme/app/pull/664.",
    });
    expect(appearance.label).toBe("PR Merged");
  });

  test("session_archived from a close without merge names the PR outcome", () => {
    const appearance = getNotificationAppearance({
      type: "session_archived",
      title: 'PR #664 closed — "Fix login" archived',
      message:
        "Your session was archived because GitHub closed https://github.com/acme/app/pull/664 without merging.",
    });
    expect(appearance.label).toBe("PR Closed");
  });

  test("session_archived without PR copy stays Archived", () => {
    const appearance = getNotificationAppearance({
      type: "session_archived",
      title: "Session archived",
    });
    expect(appearance.label).toBe("Archived");
  });
});
