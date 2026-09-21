import { describe, expect, test } from "vitest";
import {
  MAX_GENERATED_TAGS,
  parseGeneratedTags,
  selectTagsByProbability,
  TAG_PROBABILITY_THRESHOLD,
  TASK_TAGS,
  TASK_TAG_DESCRIPTIONS,
} from "@eva/shared";

test("rejects off-vocabulary tags", () => {
  expect(parseGeneratedTags("bug, foobar, feature", [])).toEqual([
    "bug",
    "feature",
  ]);
});

test("normalises casing to the vocabulary form", () => {
  expect(parseGeneratedTags("Bug, FRONTEND, Performance", [])).toEqual([
    "bug",
    "frontend",
    "performance",
  ]);
});

test("strips wrapping quotes and backticks", () => {
  expect(parseGeneratedTags("\"bug\", 'ux', `security`", [])).toEqual([
    "bug",
    "ux",
    "security",
  ]);
});

test("drops tags already applied (case-insensitive)", () => {
  expect(parseGeneratedTags("bug, design, ux", ["Bug", "UX"])).toEqual([
    "design",
  ]);
});

test("caps at MAX_GENERATED_TAGS", () => {
  const tags = parseGeneratedTags(
    "bug, feature, frontend, backend, security, design",
    [],
  );
  expect(tags).toHaveLength(MAX_GENERATED_TAGS);
  expect(tags).toEqual(["bug", "feature", "frontend"]);
});

test("empty or blank reply yields no tags", () => {
  expect(parseGeneratedTags("", [])).toEqual([]);
  expect(parseGeneratedTags("   \n  ", [])).toEqual([]);
  expect(parseGeneratedTags("none of these fit", [])).toEqual([]);
});

test("splits on newlines as well as commas", () => {
  expect(parseGeneratedTags("bug\nfrontend\nsecurity", [])).toEqual([
    "bug",
    "frontend",
    "security",
  ]);
});

/**
 * The tag generator asks Jev one boolean per tag, so the cut-off, the cap and
 * the ordering are decided here rather than by the model. A drifting
 * threshold would quietly re-tag every new task, so pin the boundary.
 */
describe("selectTagsByProbability", () => {
  test("keeps tags at the threshold and drops anything under it", () => {
    expect(
      selectTagsByProbability(
        { bug: TAG_PROBABILITY_THRESHOLD, docs: 0.59 },
        [],
      ),
    ).toEqual(["bug"]);
  });

  test("caps at MAX_GENERATED_TAGS, keeping the most likely", () => {
    const tags = selectTagsByProbability(
      { bug: 0.7, feature: 0.95, refactor: 0.8, frontend: 0.99 },
      [],
    );
    expect(tags).toHaveLength(MAX_GENERATED_TAGS);
    expect(tags).toEqual(["frontend", "feature", "refactor"]);
  });

  test("excludes already applied tags case-insensitively", () => {
    expect(
      selectTagsByProbability({ bug: 0.9, ux: 0.9, design: 0.8 }, [
        "Bug",
        "UX",
      ]),
    ).toEqual(["design"]);
  });

  test("breaks ties in vocabulary order", () => {
    expect(
      selectTagsByProbability({ ux: 0.8, bug: 0.8, backend: 0.8 }, []),
    ).toEqual(["bug", "ux", "backend"]);
  });

  test("returns nothing when no tag clears the bar", () => {
    expect(selectTagsByProbability({ bug: 0.2, docs: 0.5 }, [])).toEqual([]);
    expect(selectTagsByProbability({}, [])).toEqual([]);
  });

  test("every vocabulary tag has a rubric line for the model", () => {
    for (const tag of TASK_TAGS) {
      expect(TASK_TAG_DESCRIPTIONS[tag]?.trim().length ?? 0).toBeGreaterThan(0);
    }
    expect(Object.keys(TASK_TAG_DESCRIPTIONS)).toHaveLength(TASK_TAGS.length);
  });
});
