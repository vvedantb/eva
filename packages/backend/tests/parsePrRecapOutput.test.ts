import { describe, expect, test } from "vitest";
import {
  parsePrRecapOutput,
  PR_RECAP_WALKTHROUGH_MARKER,
} from "../convex/_prRecapWorkflow/prompts";
import { OTHER_CHANGES_STEP_TITLE } from "../convex/_prRecapWorkflow/walkthrough";

const VALID_MARKDOWN = `## Summary

Adds recap output validation so incomplete model replies are stored as errors.

## Risks
False-ready recaps hid the retry path.
`;

const CHANGED = ["convex/schema.ts", "convex/docs.ts", "web/Recap.tsx"];

function recapOutput(markdown: string, walkthrough: string): string {
  return `${markdown}\n${PR_RECAP_WALKTHROUGH_MARKER}\n${walkthrough}`;
}

function walkthroughJson(
  steps: ReadonlyArray<{ title: string; summary: string; files: string[] }>,
): string {
  return JSON.stringify({ steps });
}

describe("parsePrRecapOutput", () => {
  test("accepts markdown plus a walkthrough that covers every file", () => {
    const parsed = parsePrRecapOutput(
      recapOutput(
        VALID_MARKDOWN,
        JSON.stringify({
          steps: [
            {
              title: "Store the walkthrough",
              summary: "Adds the field.",
              files: ["convex/schema.ts", "convex/docs.ts"],
              lookClosely: "The field is optional, so old rows still load.",
            },
            {
              title: "Render it",
              summary: "Native viewer.",
              files: ["web/Recap.tsx"],
            },
          ],
        }),
      ),
      CHANGED,
    );

    expect(parsed).toEqual({
      ok: true,
      markdown: VALID_MARKDOWN.trim(),
      walkthrough: [
        {
          title: "Store the walkthrough",
          summary: "Adds the field.",
          files: ["convex/schema.ts", "convex/docs.ts"],
          lookClosely: "The field is optional, so old rows still load.",
        },
        {
          title: "Render it",
          summary: "Native viewer.",
          files: ["web/Recap.tsx"],
        },
      ],
    });
  });

  test("puts files the agent skipped into a final Other changes step", () => {
    const parsed = parsePrRecapOutput(
      recapOutput(
        VALID_MARKDOWN,
        walkthroughJson([
          {
            title: "Schema",
            summary: "Adds the field.",
            files: ["convex/schema.ts"],
          },
        ]),
      ),
      CHANGED,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const last = parsed.walkthrough.at(-1);
    expect(last?.title).toBe(OTHER_CHANGES_STEP_TITLE);
    expect(last?.files).toEqual(["convex/docs.ts", "web/Recap.tsx"]);
  });

  test("drops invented paths and keeps a repeated file in its first step only", () => {
    const parsed = parsePrRecapOutput(
      recapOutput(
        VALID_MARKDOWN,
        walkthroughJson([
          {
            title: "One",
            summary: "First.",
            files: ["convex/schema.ts", "not/in/the/pr.ts"],
          },
          {
            title: "Two",
            summary: "Second.",
            files: ["convex/schema.ts", "convex/docs.ts", "web/Recap.tsx"],
          },
        ]),
      ),
      CHANGED,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.walkthrough.map((step) => step.files)).toEqual([
      ["convex/schema.ts"],
      ["convex/docs.ts", "web/Recap.tsx"],
    ]);
  });

  test("strips a json fence around the walkthrough", () => {
    const parsed = parsePrRecapOutput(
      recapOutput(
        VALID_MARKDOWN,
        `\`\`\`json\n${walkthroughJson([{ title: "All", summary: "Everything.", files: CHANGED }])}\n\`\`\``,
      ),
      CHANGED,
    );

    expect(parsed.ok).toBe(true);
  });

  test("rejects progress narration with no marker", () => {
    expect(
      parsePrRecapOutput(
        "I'll turn the 44-file diff into a reviewer recap covering schema and UI.",
        CHANGED,
      ),
    ).toEqual({ ok: false, reason: "missing_marker" });
  });

  test("rejects a marker with heading-less markdown", () => {
    expect(
      parsePrRecapOutput(
        recapOutput(
          "I'll write the recap next after reading the remaining files.",
          walkthroughJson([
            { title: "All", summary: "Everything.", files: CHANGED },
          ]),
        ),
        CHANGED,
      ),
    ).toEqual({ ok: false, reason: "invalid_markdown" });
  });

  test("rejects a walkthrough that is not JSON or has no steps", () => {
    expect(
      parsePrRecapOutput(
        recapOutput(VALID_MARKDOWN, "<!doctype html><html></html>"),
        CHANGED,
      ),
    ).toEqual({ ok: false, reason: "invalid_walkthrough" });
    expect(
      parsePrRecapOutput(recapOutput(VALID_MARKDOWN, `{"steps":[]}`), CHANGED),
    ).toEqual({ ok: false, reason: "invalid_walkthrough" });
  });
});
