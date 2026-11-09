import { describe, expect, test } from "vitest";
import { mergeBlocker } from "./prMergeState";
import { overview } from "./prOverviewFixture";
import {
  mergeButtonLabel,
  stackBlockingReason,
  stackMergeTargets,
  stackVerdict,
  type PrStack,
  type PrStackEntry,
} from "./prStack";

function entry(position: number, partial: Partial<PrStackEntry> = {}): PrStackEntry {
  return {
    position,
    number: 40 + position,
    title: `Part ${position}`,
    htmlUrl: `https://github.com/eva/eva/pull/${40 + position}`,
    headRef: `part-${position}`,
    baseRef: position === 1 ? "main" : `part-${position - 1}`,
    status: "open",
    draft: false,
    mergeable: true,
    mergeableState: "clean",
    ...partial,
  };
}

function stack(position: number, entries: PrStackEntry[]): PrStack {
  return { number: 7, size: entries.length, position, baseRef: "main", entries };
}

/**
 * Merging entry N lands every open entry from 1 to N, so a rule that looks only
 * at the pull request on screen merges more than the reader thinks — or offers
 * a merge GitHub will refuse because something lower down is not ready.
 */
describe("stack merge targets", () => {
  test("counts open entries at and below the current one, not above", () => {
    const s = stack(3, [entry(1), entry(2), entry(3), entry(4)]);
    expect(stackMergeTargets(s).map((e) => e.number)).toEqual([41, 42, 43]);
  });

  test("skips entries that already merged", () => {
    const s = stack(3, [entry(1, { status: "merged" }), entry(2), entry(3)]);
    expect(stackMergeTargets(s).map((e) => e.number)).toEqual([42, 43]);
  });

  test("labels the button with the number of PRs it lands", () => {
    const s = stack(3, [entry(1), entry(2), entry(3)]);
    expect(mergeButtonLabel(overview({ stack: s }))).toBe("Merge 3 PRs");
    expect(mergeButtonLabel(overview({ stack: stack(1, [entry(1), entry(2)]) }))).toBe(
      "Merge",
    );
    expect(mergeButtonLabel(overview({ stack: null }))).toBe("Merge");
  });
});

describe("stack blockers", () => {
  test("a draft lower in the stack blocks the merge and is named", () => {
    const s = stack(3, [entry(1), entry(2, { draft: true }), entry(3)]);
    expect(stackBlockingReason(s)).toBe("#42 is still a draft.");
    expect(mergeBlocker(overview({ stack: s }))?.kind).toBe("stack");
    expect(stackVerdict(s).label).toBe("Stack needs attention");
  });

  test("a closed lower entry blocks; a merged one does not", () => {
    expect(
      stackBlockingReason(stack(2, [entry(1, { status: "closed" }), entry(2)])),
    ).toBe("#41 is closed without being merged.");
    expect(
      stackBlockingReason(stack(2, [entry(1, { status: "merged" }), entry(2)])),
    ).toBeNull();
  });

  test("entries above the current one never block it", () => {
    const s = stack(1, [entry(1), entry(2, { draft: true, mergeable: false })]);
    expect(stackBlockingReason(s)).toBeNull();
    expect(mergeBlocker(overview({ stack: s }))).toBeNull();
  });

  test("the verdict reports pending, failing checks and a merged stack", () => {
    expect(stackVerdict(stack(2, [entry(1, { mergeable: null }), entry(2)])).label).toBe(
      "Merge status pending",
    );
    expect(
      stackVerdict(stack(2, [entry(1, { mergeableState: "unstable" }), entry(2)])).label,
    ).toBe("Mergeable with failing checks");
    expect(
      stackVerdict(
        stack(2, [entry(1, { status: "merged" }), entry(2, { status: "merged" })]),
      ).label,
    ).toBe("Stack merged");
    expect(stackVerdict(stack(2, [entry(1), entry(2)])).label).toBe("Ready to merge");
  });
});
