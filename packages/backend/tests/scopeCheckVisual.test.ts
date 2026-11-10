import { describe, expect, it } from "vitest";
import { MAX_QUESTIONS } from "../convex/_jev/schema";
import {
  buildVisualQuestions,
  isScreenshotType,
  screenshotName,
} from "../convex/_scopeCheck/visual";
import {
  hunkKey,
  MAX_FLAGGED_HUNKS,
  type JudgedHunk,
} from "../convex/_scopeCheck/verdict";

function flagged(overrides: Partial<JudgedHunk> = {}): JudgedHunk {
  return {
    file: "apps/web/src/AwardedPanel.tsx",
    header: "@@ -3,1 +3,1 @@",
    requested: 0.05,
    necessary: 0.1,
    kind: "icon",
    summary: "Icon changed (IconAward → IconTrophy)",
    surface: "Awarded panel",
    ...overrides,
  };
}

describe("buildVisualQuestions", () => {
  const names = [screenshotName(0), screenshotName(1)];

  it("always asks whether the screenshots show the request, citing each by name", () => {
    const { questions } = buildVisualQuestions(names, []);
    expect(Object.keys(questions)).toEqual(["shows_request"]);
    expect(questions.shows_request.instructions).toContain("`screenshot_1`");
    expect(questions.shows_request.instructions).toContain("`screenshot_2`");
  });

  it("asks about each flagged hunk a user could see, and maps the answer back", () => {
    const icon = flagged();
    const { questions, hunkByQuestion } = buildVisualQuestions(names, [icon]);
    const [questionId] = [...hunkByQuestion.keys()];
    expect(hunkByQuestion.get(questionId)).toBe(hunkKey(icon));
    expect(questions[questionId].instructions).toContain(
      "Icon changed (IconAward → IconTrophy) in Awarded panel",
    );
  });

  it("skips code-only and unclassified hunks", () => {
    const { hunkByQuestion } = buildVisualQuestions(names, [
      flagged({ kind: "internal", header: "@@ -1 +1 @@" }),
      flagged({ kind: undefined, header: "@@ -2 +2 @@" }),
    ]);
    expect(hunkByQuestion.size).toBe(0);
  });

  it("fits a full flagged list inside one Jev call", () => {
    const all = Array.from({ length: MAX_FLAGGED_HUNKS }, (_, index) =>
      flagged({ header: `@@ -${index} +${index} @@` }),
    );
    const { questions } = buildVisualQuestions(names, all);
    expect(Object.keys(questions).length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
});

describe("isScreenshotType", () => {
  it("takes stills and leaves recordings out", () => {
    expect(isScreenshotType("image/png")).toBe(true);
    expect(isScreenshotType("image/jpeg")).toBe(true);
    expect(isScreenshotType("video/webm")).toBe(false);
    expect(isScreenshotType(undefined)).toBe(false);
  });
});
