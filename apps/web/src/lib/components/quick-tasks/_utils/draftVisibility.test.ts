import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  draftCountAfterRemove,
  draftsAfterRemove,
  visibleDrafts,
} from "./draftVisibility";

/**
 * Reported bug: "Delete draft in the quick task modal doesn't work" (fix
 * 613e5d8cc). `api.agentTasks.remove` soft-deletes, so the row survives; the
 * modal pressed the trash, the subscription pushed the same draft back, and
 * the button looked dead.
 *
 * The server half of that fix — listDrafts/countDrafts ranging over
 * by_repo_status_and_deleted — is covered by draftSoftDelete.test.ts in the
 * backend. This covers the client half, which is what the user actually sees
 * in the second before the server answers: the optimistic list and count.
 *
 * The failure mode is silent. Dropping the clamp, or filtering on the wrong
 * key, still compiles and still looks right on the happy path with two drafts
 * present.
 */

interface Draft {
  _id: string;
  deletedAt?: number;
}

const live: Draft = { _id: "live" };
const alsoLive: Draft = { _id: "also-live" };
const soft: Draft = { _id: "soft", deletedAt: 1_700_000_000_000 };

describe("visibleDrafts", () => {
  test("hides a soft-deleted draft and keeps the rest", () => {
    expect(visibleDrafts([live, soft, alsoLive])).toEqual([live, alsoLive]);
  });

  test("treats a zero timestamp as deleted, not as absent", () => {
    // `deletedAt: 0` is falsy, so a truthiness check would show this row.
    expect(visibleDrafts([{ _id: "epoch", deletedAt: 0 }])).toEqual([]);
  });

  test("keeps order so the list does not jump on an unrelated push", () => {
    expect(visibleDrafts([alsoLive, live]).map((d) => d._id)).toEqual([
      "also-live",
      "live",
    ]);
  });
});

describe("draftsAfterRemove", () => {
  test("drops the removed row before the server stamps deletedAt", () => {
    // The row still has no `deletedAt` at this point — this is the whole
    // reason the optimistic update has to match on id.
    expect(draftsAfterRemove([live, alsoLive], "live")).toEqual([alsoLive]);
  });

  test("still hides other rows that already carry deletedAt", () => {
    expect(draftsAfterRemove([live, soft, alsoLive], "live")).toEqual([
      alsoLive,
    ]);
  });

  test("is a no-op for an id that is not in the list", () => {
    expect(draftsAfterRemove([live, alsoLive], "gone")).toEqual([
      live,
      alsoLive,
    ]);
  });

  test("does not mutate the store array it was handed", () => {
    // The argument is Convex's cached query result; writing to it in place
    // corrupts every other subscriber of the same query.
    const rows = [live, alsoLive];
    draftsAfterRemove(rows, "live");
    expect(rows).toEqual([live, alsoLive]);
  });
});

describe("draftCountAfterRemove", () => {
  test("decrements the badge", () => {
    expect(draftCountAfterRemove(2)).toBe(1);
  });

  test("clamps at zero when the count is already stale", () => {
    // List and count are separate subscriptions, so they can disagree. A
    // negative badge is the visible symptom of dropping the clamp.
    expect(draftCountAfterRemove(0)).toBe(0);
  });

  test("hides the badge entirely on the last draft", () => {
    expect(draftCountAfterRemove(1)).toBe(0);
  });
});

describe("the quick-task modal's delete path", () => {
  test("routes both store writes through these helpers", () => {
    // Extracting the logic only protects the modal while the modal calls it.
    // Inlining it again is how the clamp and the predicate get lost.
    const modal = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../QuickTaskModal.tsx"),
      "utf8",
    );
    expect(modal).toContain("draftsAfterRemove(current, args.id)");
    expect(modal).toContain("draftCountAfterRemove(count)");
    expect(modal).toContain("visibleDrafts(draftRows)");
    // A hand-rolled predicate alongside the helper means one of the two paths
    // has drifted.
    expect(modal).not.toContain("Math.max(0, count - 1)");
    expect(modal).not.toContain("draft.deletedAt === undefined");
  });
});
