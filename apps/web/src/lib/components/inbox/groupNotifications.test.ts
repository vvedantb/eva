import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { Id } from "@eva/backend";
import type { Notification } from "@/lib/components/notifications/notification-config";
import {
  groupNotifications,
  OTHER_REPO_GROUP_LABEL,
} from "./groupNotifications";

const notificationId = z.custom<Id<"notifications">>();
const repoId = z.custom<Id<"githubRepos">>();
const userId = z.custom<Id<"users">>().parse("user_1");

const DAY_MS = 24 * 60 * 60 * 1000;
const evaRepo = repoId.parse("repo_eva");
const uiRepo = repoId.parse("repo_ui");

const repoById = new Map([
  [evaRepo, { name: "eva" }],
  [uiRepo, { name: "design-system", label: "UI" }],
]);

function notification(
  id: string,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    _id: notificationId.parse(id),
    _creationTime: 0,
    userId,
    type: "system",
    title: id,
    read: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("groupNotifications", () => {
  test("day buckets today and yesterday under their own headers", () => {
    const groups = groupNotifications(
      [
        notification("a"),
        notification("b"),
        notification("c", { createdAt: Date.now() - DAY_MS }),
      ],
      "day",
      repoById,
    );

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups[0]?.items.map((n) => n.title)).toEqual(["a", "b"]);
    expect(groups[1]?.items.map((n) => n.title)).toEqual(["c"]);
  });

  test("repo uses the display label and collects repo-less rows under Other", () => {
    const groups = groupNotifications(
      [
        notification("a", { repoId: uiRepo }),
        notification("b"),
        notification("c", { repoId: evaRepo }),
        notification("d", { repoId: uiRepo }),
      ],
      "repo",
      repoById,
    );

    // "UI" is the custom label, not the GitHub name; group order follows the
    // newest-first input, so the most recent item leads.
    expect(groups.map((g) => g.label)).toEqual([
      "UI",
      OTHER_REPO_GROUP_LABEL,
      "eva",
    ]);
    expect(groups[0]?.items.map((n) => n.title)).toEqual(["a", "d"]);
  });

  test("repo treats an unknown repo id as Other", () => {
    const groups = groupNotifications(
      [notification("a", { repoId: repoId.parse("repo_gone") })],
      "repo",
      repoById,
    );

    expect(groups.map((g) => g.label)).toEqual([OTHER_REPO_GROUP_LABEL]);
  });

  test("type uses the human label the status icon already shows", () => {
    const groups = groupNotifications(
      [
        notification("a", { type: "mention" }),
        notification("b", { type: "run_completed" }),
        notification("c", { type: "mention" }),
      ],
      "type",
      repoById,
    );

    expect(groups.map((g) => g.label)).toEqual(["Mention", "Run Done"]);
    expect(groups[0]?.items.map((n) => n.title)).toEqual(["a", "c"]);
  });

  test("an empty list has no groups", () => {
    expect(groupNotifications([], "day", repoById)).toEqual([]);
  });
});
