import { describe, expect, it } from "vitest";
import {
  clipDiffForOverall,
  clipPrompt,
  FLAG_THRESHOLD,
  HUNK_QUESTIONS,
  MAX_FLAGGED_HUNKS,
  MAX_OVERALL_DIFF_CHARS,
  MAX_PROMPT_CHARS,
  OVERALL_QUESTION,
  isFlagged,
  summariseScopeCheck,
  type JudgedHunk,
} from "../convex/_scopeCheck/verdict";

function hunk(
  requested: number,
  necessary: number,
  file = "src/a.ts",
): JudgedHunk {
  return { file, header: `@@ ${requested} @@`, requested, necessary };
}

describe("questions", () => {
  it("asks the two per-hunk questions as booleans", () => {
    expect(Object.keys(HUNK_QUESTIONS)).toEqual(["requested", "necessary"]);
    expect(HUNK_QUESTIONS.requested.type).toBe("boolean");
    expect(HUNK_QUESTIONS.necessary.type).toBe("boolean");
    expect(HUNK_QUESTIONS.requested.criteria.true).not.toBe("");
    expect(HUNK_QUESTIONS.requested.criteria.false).toContain("icon");
  });

  it("asks one whole-diff headline question", () => {
    expect(Object.keys(OVERALL_QUESTION)).toEqual(["unrequested"]);
    expect(OVERALL_QUESTION.unrequested.type).toBe("boolean");
  });
});

describe("isFlagged", () => {
  it("flags only when both answers lean negative", () => {
    expect(isFlagged(hunk(0.1, 0.1))).toBe(true);
    expect(isFlagged(hunk(0.9, 0.1))).toBe(false);
    expect(isFlagged(hunk(0.1, 0.9))).toBe(false);
  });

  it("treats the threshold itself as in scope", () => {
    expect(isFlagged(hunk(FLAG_THRESHOLD, 0.1))).toBe(false);
    expect(isFlagged(hunk(0.1, FLAG_THRESHOLD))).toBe(false);
    expect(isFlagged(hunk(FLAG_THRESHOLD - 0.01, FLAG_THRESHOLD - 0.01))).toBe(
      true,
    );
  });
});

describe("summariseScopeCheck", () => {
  const base = {
    totalHunks: 3,
    diffTruncated: false,
    evaluatedAt: 1_700_000_000_000,
  };

  it("keeps the flagged hunks worst first", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.8,
      judged: [
        hunk(0.4, 0.2, "src/b.ts"),
        hunk(0.95, 0.9, "src/ok.ts"),
        hunk(0.05, 0.1, "src/a.ts"),
      ],
    });
    expect(verdict.flagged.map((entry) => entry.file)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(verdict.judgedHunks).toBe(3);
    expect(verdict.unrequestedProbability).toBe(0.8);
    expect(verdict.evaluatedAt).toBe(base.evaluatedAt);
    expect(verdict.partial).toBe(false);
  });

  it("caps the stored flags", () => {
    const judged = Array.from({ length: MAX_FLAGGED_HUNKS + 5 }, (_, index) =>
      hunk(index / 1000, 0.1, `src/${index}.ts`),
    );
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.9,
      judged,
      totalHunks: judged.length,
    });
    expect(verdict.flagged).toHaveLength(MAX_FLAGGED_HUNKS);
    expect(verdict.flagged[0].file).toBe("src/0.ts");
  });

  it("marks partial when the diff was truncated", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.1,
      judged: [hunk(0.9, 0.9), hunk(0.9, 0.9), hunk(0.9, 0.9)],
      diffTruncated: true,
    });
    expect(verdict.partial).toBe(true);
  });

  it("marks partial when hunks past the cap went unjudged", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.1,
      judged: [hunk(0.9, 0.9)],
      totalHunks: 90,
    });
    expect(verdict.partial).toBe(true);
    expect(verdict.totalHunks).toBe(90);
    expect(verdict.judgedHunks).toBe(1);
  });

  it("falls back to the worst hunk when the overall call failed", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: null,
      judged: [hunk(0.8, 0.9), hunk(0.25, 0.1)],
      totalHunks: 2,
    });
    expect(verdict.unrequestedProbability).toBeCloseTo(0.75, 10);
  });

  it("falls back to zero when nothing was judged", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: null,
      judged: [],
      totalHunks: 0,
    });
    expect(verdict.unrequestedProbability).toBe(0);
    expect(verdict.flagged).toEqual([]);
    expect(verdict.partial).toBe(false);
  });
});

describe("clipping", () => {
  it("clips the prompt to the cap", () => {
    expect(clipPrompt("a".repeat(MAX_PROMPT_CHARS + 500))).toHaveLength(
      MAX_PROMPT_CHARS,
    );
    expect(clipPrompt("short ask")).toBe("short ask");
  });

  it("leaves a diff under the cap alone", () => {
    expect(clipDiffForOverall("+a\n+b\n")).toEqual({
      text: "+a\n+b\n",
      clipped: false,
    });
  });

  it("clips a long diff on a line boundary", () => {
    const line = "+".padEnd(100, "y");
    const diff = Array.from({ length: 3000 }, () => line).join("\n");
    const result = clipDiffForOverall(diff);
    expect(result.clipped).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_OVERALL_DIFF_CHARS);
    for (const clippedLine of result.text.split("\n")) {
      expect(clippedLine).toBe(line);
    }
  });
});
