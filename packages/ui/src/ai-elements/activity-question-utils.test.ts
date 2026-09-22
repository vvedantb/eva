import { describe, expect, test } from "vitest";
import { freeTextAnswer, selectedLabels } from "./activity-question-utils";
import type { ActivityQuestion } from "./activity-shared";

/**
 * An answered AskUserQuestion is kept in the transcript as a card that
 * highlights what the user picked — the whole point of persisting the options.
 * Answers arrive as the plain text the dock submitted, keyed by question, so
 * matching them back onto the offered labels is where the picked option can
 * silently go missing again.
 */

function question(overrides: Partial<ActivityQuestion> = {}): ActivityQuestion {
  return {
    question: "Which database?",
    options: [{ label: "Postgres" }, { label: "Convex" }],
    ...overrides,
  };
}

describe("selectedLabels", () => {
  test("highlights the picked option", () => {
    expect(selectedLabels("Convex", question())).toEqual(["Convex"]);
  });

  test("an unanswered question highlights nothing", () => {
    expect(selectedLabels(undefined, question())).toEqual([]);
  });

  test("splits a multi-select answer on the dock's separator", () => {
    expect(
      selectedLabels("Postgres, Convex", question({ multiSelect: true })),
    ).toEqual(["Postgres", "Convex"]);
  });

  /**
   * A label may itself contain ", ". Matching the whole answer first keeps such
   * a label highlighted instead of splitting it into two labels that match
   * nothing and demoting the pick to free text.
   */
  test("a label containing the separator is matched whole", () => {
    const commaLabel = question({
      options: [{ label: "Postgres, then Convex" }, { label: "Convex" }],
    });
    expect(selectedLabels("Postgres, then Convex", commaLabel)).toEqual([
      "Postgres, then Convex",
    ]);
    expect(
      selectedLabels(
        "Postgres, then Convex",
        question({
          multiSelect: true,
          options: [{ label: "Postgres, then Convex" }, { label: "Convex" }],
        }),
      ),
    ).toEqual(["Postgres, then Convex"]);
  });

  test("a single-select answer is never split", () => {
    expect(selectedLabels("Postgres, Convex", question())).toEqual([]);
  });

  test("labels that were not offered are dropped", () => {
    expect(
      selectedLabels("Postgres, SQLite", question({ multiSelect: true })),
    ).toEqual(["Postgres"]);
    expect(selectedLabels("SQLite", question())).toEqual([]);
  });
});

describe("freeTextAnswer", () => {
  test("typed text that matched no option is kept for the Other row", () => {
    expect(freeTextAnswer("SQLite, actually", [])).toBe("SQLite, actually");
  });

  test("a picked option is not repeated as free text", () => {
    expect(freeTextAnswer("Convex", ["Convex"])).toBeNull();
  });

  test("no answer and blank answers show no Other row", () => {
    expect(freeTextAnswer(undefined, [])).toBeNull();
    expect(freeTextAnswer("   ", [])).toBeNull();
  });
});
