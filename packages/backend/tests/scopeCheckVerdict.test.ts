import { describe, expect, it } from "vitest";
import {
  buildOverallDiff,
  clipPrompt,
  FLAG_THRESHOLD,
  HUNK_QUESTIONS,
  MAX_FLAGGED_HUNKS,
  MAX_OVERALL_DIFF_CHARS,
  MAX_PROMPT_CHARS,
  MENTION_THRESHOLD,
  OVERALL_QUESTION,
  hunkKey,
  isFlagged,
  selectFlagged,
  summariseScopeCheck,
  type JudgedHunk,
} from "../convex/_scopeCheck/verdict";
import type { DiffHunk } from "../convex/_scopeCheck/hunks";

function hunk(
  requested: number,
  necessary: number,
  file = "src/a.ts",
): JudgedHunk {
  return { file, header: `@@ ${requested} @@`, requested, necessary };
}

function diffHunk(file: string, header: string, body: string): DiffHunk {
  return { file, header, body };
}

describe("selectFlagged", () => {
  it("is the same set, order and cap the verdict stores", () => {
    const judged = [
      hunk(0.4, 0.2, "src/b.ts"),
      hunk(0.95, 0.9, "src/ok.ts"),
      hunk(0.05, 0.1, "src/a.ts"),
    ];
    expect(selectFlagged(judged).map((entry) => entry.file)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(
      selectFlagged(
        Array.from({ length: MAX_FLAGGED_HUNKS + 3 }, (_, index) =>
          hunk(index / 1000, 0.1, `src/${index}.ts`),
        ),
      ),
    ).toHaveLength(MAX_FLAGGED_HUNKS);
  });
});

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

  it("carries the labels and the mention answer onto the flagged rows", () => {
    const flagged: JudgedHunk = {
      ...hunk(0.05, 0.1, "src/AwardedPanel.tsx"),
      kind: "icon",
      summary: "Icon changed (IconAward → IconTrophy)",
      surface: "Awarded panel",
    };
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.9,
      judged: [flagged, hunk(0.9, 0.9, "src/ok.ts")],
      mentioned: new Map([[hunkKey(flagged), 0.04]]),
    });
    expect(verdict.flagged[0]).toMatchObject({
      kind: "icon",
      summary: "Icon changed (IconAward → IconTrophy)",
      surface: "Awarded panel",
      mentioned: 0.04,
    });
    expect(verdict.flagged[0].mentioned).toBeLessThan(MENTION_THRESHOLD);
  });

  it("leaves mentioned absent when that call never answered", () => {
    const verdict = summariseScopeCheck({
      ...base,
      unrequestedProbability: 0.9,
      judged: [hunk(0.05, 0.1)],
    });
    // Absent must not read as "the reply stayed silent" — nobody asked.
    expect(verdict.flagged[0].mentioned).toBeUndefined();
    expect("mentioned" in verdict.flagged[0]).toBe(false);
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
});

describe("buildOverallDiff", () => {
  it("writes one path line per run of hunks in the same file", () => {
    const result = buildOverallDiff([
      diffHunk("src/a.ts", "@@ -1 +1 @@", "+one"),
      diffHunk("src/a.ts", "@@ -9 +9 @@", "+two\n+three"),
      diffHunk("src/b.ts", "@@ -4 +4 @@", "+four"),
    ]);
    expect(result.clipped).toBe(false);
    expect(result.text.split("\n")).toEqual([
      "--- src/a.ts",
      "@@ -1 +1 @@",
      "+one",
      "@@ -9 +9 @@",
      "+two",
      "+three",
      "--- src/b.ts",
      "@@ -4 +4 @@",
      "+four",
    ]);
  });

  it("repeats a path line when the file comes back later", () => {
    const result = buildOverallDiff([
      diffHunk("src/a.ts", "@@ -1 +1 @@", "+one"),
      diffHunk("src/b.ts", "@@ -2 +2 @@", "+two"),
      diffHunk("src/a.ts", "@@ -3 +3 @@", "+three"),
    ]);
    expect(
      result.text.split("\n").filter((line) => line.startsWith("--- ")),
    ).toEqual(["--- src/a.ts", "--- src/b.ts", "--- src/a.ts"]);
  });

  it("includes every hunk's header and body", () => {
    const result = buildOverallDiff([
      diffHunk("src/a.ts", "@@ -1,2 +1,3 @@ fn a", "+alpha"),
      diffHunk("src/b.ts", "@@ -7,1 +7,2 @@ fn b", "-beta\n+gamma"),
    ]);
    for (const fragment of [
      "@@ -1,2 +1,3 @@ fn a",
      "+alpha",
      "@@ -7,1 +7,2 @@ fn b",
      "-beta",
      "+gamma",
    ]) {
      expect(result.text).toContain(fragment);
    }
  });

  it("returns nothing for an empty hunk list", () => {
    expect(buildOverallDiff([])).toEqual({ text: "", clipped: false });
  });

  it("clips on a line boundary at the cap", () => {
    const body = "+".padEnd(100, "y");
    const header = "@@ -1,4 +1,4 @@";
    const hunks = Array.from({ length: 400 }, () =>
      diffHunk("src/a.ts", header, body),
    );
    const result = buildOverallDiff(hunks);
    expect(result.clipped).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_OVERALL_DIFF_CHARS);
    // Every surviving line is whole: no line was cut through the middle.
    for (const line of result.text.split("\n")) {
      expect([body, header, "--- src/a.ts"]).toContain(line);
    }
  });

  it("keeps the whole-diff budget inside what the gateway actually serves", () => {
    // 41k answered, 77k returned 503 repeatably. Leave headroom for the prompt
    // and JSON escaping on top of the diff text.
    expect(MAX_OVERALL_DIFF_CHARS).toBeLessThanOrEqual(50_000);
  });
});
