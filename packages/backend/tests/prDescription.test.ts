import { expect, test } from "vitest";
import { buildPrBody, buildTaskPrSections } from "../convex/prBody";
import {
  PR_DESCRIPTION_END,
  PR_DESCRIPTION_START,
  buildPrDescriptionPrompt,
  cleanPrDescription,
  insertPrDescription,
  stripPrDescription,
} from "../convex/_github/prDescriptionPrompt";

const EVA_URL = "https://eva.example/pr";
const DESCRIPTION =
  "### What changed\nAdds the toggle.\n\n### Shape\n```text\nsrc/\n└── toggle.ts  # new\n```";

test("insertPrDescription places the block above the footer of a task body", () => {
  const body = buildPrBody(buildTaskPrSections("Ship the toggle", []), EVA_URL);
  const result = insertPrDescription(body, DESCRIPTION);

  expect(result).toBe(
    [
      "## Task",
      "Ship the toggle",
      "",
      PR_DESCRIPTION_START,
      DESCRIPTION,
      PR_DESCRIPTION_END,
      "---",
      `[View in Eva](${EVA_URL}) | *Created by Eva*`,
    ].join("\n"),
  );
});

test("insertPrDescription handles a body that is only the footer", () => {
  const body = buildPrBody([], EVA_URL);
  const result = insertPrDescription(body, DESCRIPTION);

  expect(result.startsWith(PR_DESCRIPTION_START)).toBe(true);
  expect(result.endsWith(`[View in Eva](${EVA_URL}) | *Created by Eva*`)).toBe(
    true,
  );
  expect(result.indexOf("---")).toBeGreaterThan(
    result.indexOf(PR_DESCRIPTION_END),
  );
});

test("insertPrDescription replaces an existing block instead of stacking", () => {
  const body = buildPrBody(buildTaskPrSections("Ship the toggle", []), EVA_URL);
  const once = insertPrDescription(body, "old text");
  const twice = insertPrDescription(once, DESCRIPTION);

  expect(twice).not.toContain("old text");
  expect(twice.split(PR_DESCRIPTION_START)).toHaveLength(2);
  expect(twice).toBe(insertPrDescription(body, DESCRIPTION));
});

test("insertPrDescription appends when there is no footer", () => {
  expect(insertPrDescription("Hand-written body", DESCRIPTION)).toBe(
    `Hand-written body\n\n${PR_DESCRIPTION_START}\n${DESCRIPTION}\n${PR_DESCRIPTION_END}`,
  );
  expect(insertPrDescription("", DESCRIPTION)).toBe(
    `${PR_DESCRIPTION_START}\n${DESCRIPTION}\n${PR_DESCRIPTION_END}`,
  );
});

test("stripPrDescription removes the block and leaves the static body", () => {
  const body = buildPrBody(buildTaskPrSections("Ship the toggle", []), EVA_URL);
  expect(stripPrDescription(insertPrDescription(body, DESCRIPTION))).toBe(body);
  expect(stripPrDescription(body)).toBe(body);
});

test("cleanPrDescription unwraps a whole-answer fence and bounds length", () => {
  expect(cleanPrDescription("```markdown\n### What changed\nx\n```")).toBe(
    "### What changed\nx",
  );
  expect(cleanPrDescription("  ### What changed\nx  ")).toBe(
    "### What changed\nx",
  );
  const long = cleanPrDescription("a".repeat(10_000));
  expect(long.length).toBeLessThan(6_100);
  expect(long.endsWith("_Description truncated._")).toBe(true);
});

test("buildPrDescriptionPrompt asks for the three sections and forbids invention", () => {
  const prompt = buildPrDescriptionPrompt({
    prTitle: "Eva: toggle",
    context: "## Task\nShip the toggle",
    diffText: "### src/toggle.ts (+3/-0)\n+export const on = true;",
    changedFiles: 1,
    additions: 3,
    deletions: 0,
    truncated: true,
  });

  expect(prompt).toContain("### What changed");
  expect(prompt).toContain("### Shape");
  expect(prompt).toContain("### Review notes");
  expect(prompt).toContain("Never invent names");
  expect(prompt).toContain("diff truncated");
  expect(prompt).toContain("## Intent (from Eva)\n## Task\nShip the toggle");
  expect(prompt.indexOf("## Diff")).toBeGreaterThan(prompt.indexOf("## Rules"));
});

test("buildPrDescriptionPrompt omits the intent block when there is none", () => {
  const prompt = buildPrDescriptionPrompt({
    prTitle: "Eva: toggle",
    context: "   ",
    diffText: "x",
    changedFiles: 1,
    additions: 1,
    deletions: 0,
    truncated: false,
  });
  expect(prompt).not.toContain("## Intent");
  expect(prompt).not.toContain("truncated");
});

/**
 * The only unrequested-change check a quick task run gets: a run stamps no turn
 * diff, so the scope chip never judges it. This reader has the diff and the
 * task description together, which is what the run's own summary does not.
 */
test("buildPrDescriptionPrompt leads the review notes on unrequested visible changes", () => {
  const prompt = buildPrDescriptionPrompt({
    prTitle: "Eva: tabs",
    context: "## Task\nAdd four tabs",
    diffText: "x",
    changedFiles: 9,
    additions: 300,
    deletions: 20,
    truncated: false,
  });

  expect(prompt).toContain("Visible changes the Intent did not ask for");
  // The concrete examples matter: "anything unrequested" reads as boilerplate.
  for (const cue of ["icon", "colour", "copy or labels", "Lead with these"]) {
    expect(prompt).toContain(cue);
  }
  // Nothing to judge against without an Intent, so it must not guess.
  expect(prompt).toContain("when no Intent is given, skip (1)");
});
