import { describe, expect, it } from "vitest";
import {
  formatPercent,
  hunkUnrequestedProbability,
  scopeCheckLabel,
  scopeCheckTone,
  SCOPE_FLAGGED_THRESHOLD,
  SCOPE_REVIEW_THRESHOLD,
  type ScopeCheck,
  type ScopeCheckHunk,
} from "@/lib/components/chat/_components/scopeCheckSummary";

function hunk(overrides: Partial<ScopeCheckHunk> = {}): ScopeCheckHunk {
  return {
    file: "apps/web/src/lib/components/chat/ChatMessage.tsx",
    header: "@@ -1,4 +1,6 @@ function ChatMessage()",
    requested: 0.1,
    necessary: 0.2,
    ...overrides,
  };
}

function check(overrides: Partial<ScopeCheck> = {}): ScopeCheck {
  return {
    unrequestedProbability: 0,
    totalHunks: 4,
    judgedHunks: 4,
    flagged: [],
    partial: false,
    evaluatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/**
 * The thresholds are the whole contract: a reviewer reads the chip's colour
 * before its text, so a turn landing one point either side of a boundary has
 * to pick the tone the number implies.
 */
describe("scopeCheckTone", () => {
  it("is clear below the review threshold", () => {
    expect(scopeCheckTone(check({ unrequestedProbability: 0 }))).toBe("clear");
    expect(scopeCheckTone(check({ unrequestedProbability: 0.34 }))).toBe(
      "clear",
    );
  });

  it("is review at the review threshold and below the flagged one", () => {
    expect(
      scopeCheckTone(check({ unrequestedProbability: SCOPE_REVIEW_THRESHOLD })),
    ).toBe("review");
    expect(scopeCheckTone(check({ unrequestedProbability: 0.64 }))).toBe(
      "review",
    );
  });

  it("is flagged at the flagged threshold", () => {
    expect(
      scopeCheckTone(check({ unrequestedProbability: SCOPE_FLAGGED_THRESHOLD })),
    ).toBe("flagged");
    expect(scopeCheckTone(check({ unrequestedProbability: 1 }))).toBe("flagged");
  });

  it("is flagged whenever a hunk is named, however low the probability", () => {
    expect(
      scopeCheckTone(
        check({ unrequestedProbability: 0, flagged: [hunk()] }),
      ),
    ).toBe("flagged");
  });
});

describe("scopeCheckLabel", () => {
  it("reassures when the turn stayed in scope", () => {
    expect(scopeCheckLabel(check({ unrequestedProbability: 0.1 }))).toBe(
      "In scope",
    );
  });

  it("hedges in the middle band", () => {
    expect(scopeCheckLabel(check({ unrequestedProbability: 0.5 }))).toBe(
      "Check scope",
    );
  });

  it("counts named hunks, singular and plural", () => {
    expect(
      scopeCheckLabel(check({ unrequestedProbability: 0.8, flagged: [hunk()] })),
    ).toBe("1 unrequested change");
    expect(
      scopeCheckLabel(
        check({
          unrequestedProbability: 0.8,
          flagged: [hunk(), hunk({ file: "packages/ui/src/ui/badge.tsx" })],
        }),
      ),
    ).toBe("2 unrequested changes");
  });

  it("falls back to a verdict when the probability is high but no hunk is named", () => {
    expect(scopeCheckLabel(check({ unrequestedProbability: 0.9 }))).toBe(
      "Likely off scope",
    );
  });
});

describe("formatPercent", () => {
  it("renders whole percents", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.355)).toBe("36%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("hunkUnrequestedProbability", () => {
  it("inverts the requested probability", () => {
    expect(hunkUnrequestedProbability(hunk({ requested: 0.1 }))).toBeCloseTo(
      0.9,
    );
    expect(hunkUnrequestedProbability(hunk({ requested: 1 }))).toBe(0);
  });
});
