import { describe, expect, test } from "vitest";
import { collectChangedFiles } from "@eva/shared";
import {
  hasStepDetail,
  parseToolSteps,
  parseTraceSegments,
  summariseToolSteps,
} from "@eva/shared/activityTrace";

/** The mobile chat's tool trace reads `messages.activityLog` with no web types. */
describe("activity trace", () => {
  const log = JSON.stringify([
    { type: "thinking", label: "Thought", status: "complete" },
    { type: "read", label: "Read file", detail: "src/App.tsx", status: "complete" },
    { type: "bash", label: "Ran command", detail: "pnpm test", status: "complete" },
    { type: "read", label: "Read file", detail: "src/theme.ts", status: "active" },
    { type: "edit", status: "complete" },
    { type: "response", label: "Response", status: "complete" },
  ]);

  test("keeps tool steps in order and drops other or malformed steps", () => {
    expect(parseToolSteps(log).map((step) => step.detail)).toEqual(["src/App.tsx", "pnpm test", "src/theme.ts"]);
  });

  test("summarises each kind of work once, as the web does", () => {
    expect(summariseToolSteps(parseToolSteps(log))).toBe("Read files, ran commands");
  });

  test("keeps an edited file's path for the phone's Changed files card", () => {
    const steps = parseToolSteps(
      JSON.stringify([
        { type: "write", label: "Created file", path: "/tmp/repo/src/toCsv.ts", status: "complete" },
        { type: "read", label: "Read file", path: "/tmp/repo/src/App.tsx", status: "complete" },
        { type: "edit", label: "Edited file", path: "/tmp/repo/src/toCsv.ts", status: "complete" },
      ]),
    );
    expect(collectChangedFiles(steps)).toEqual([
      { path: "/tmp/repo/src/toCsv.ts", name: "toCsv.ts", dir: "src", repoName: null },
    ]);
  });

  test("legacy plain text, empty and missing logs give no steps", () => {
    expect(parseToolSteps("Ran the tests")).toEqual([]);
    expect(parseToolSteps("[]")).toEqual([]);
    expect(parseToolSteps(undefined)).toEqual([]);
  });

  test("keeps step detail (command, output, edits) and flags trimmed detail", () => {
    const steps = parseToolSteps(
      JSON.stringify([
        { type: "bash", label: "Ran command", status: "complete", command: "pnpm test", output: { text: "ok", exitCode: 0 } },
        { type: "edit", label: "Edited file", status: "complete", edits: [{ oldText: "a", newText: "b" }] },
        { type: "read", label: "Read file", status: "complete", hasHiddenDetail: true },
        { type: "read", label: "Read file", status: "complete" },
      ]),
    );
    expect(steps[0]?.output).toEqual({ text: "ok", exitCode: 0 });
    expect(steps[1]?.edits).toEqual([{ oldText: "a", newText: "b" }]);
    expect(steps.map(hasStepDetail)).toEqual([true, true, true, false]);
  });
});

describe("trace segments", () => {
  const segmentsOf = (steps: object[]) =>
    parseTraceSegments(JSON.stringify(steps)).map((segment) =>
      segment.kind === "reasoning"
        ? `reasoning: ${segment.text}`
        : `${summariseToolSteps(segment.steps.map(({ step }) => step))} [${segment.steps.map(({ index }) => index).join(",")}]`,
    );

  test("keeps reasoning as prose and folds the tool steps after it into one run", () => {
    expect(
      segmentsOf([
        { type: "reasoning", label: "Thought", detail: " Find the table. ", status: "complete" },
        { type: "search_code", label: "Searched code", status: "complete" },
        { type: "response", label: "Response", detail: "On it.", status: "complete" },
        { type: "read", label: "Read file", status: "complete" },
        { type: "thinking", label: "Thought", detail: "Now write it.", status: "complete" },
        { type: "write", label: "Created file", status: "complete" },
        { type: "bash", label: "Ran command", status: "active" },
      ]),
    ).toEqual([
      "reasoning: Find the table.",
      // The reply text is hidden in the folded trace, so it does not split the run.
      "Searched the code, read files [0,1]",
      "reasoning: Now write it.",
      "Created files, ran commands [2,3]",
    ]);
  });

  test("a narration step ends a run; filler thinking and status lines do not", () => {
    expect(
      segmentsOf([
        { type: "read", label: "Read file", status: "complete" },
        { type: "thinking", label: "Thought", detail: "Claude is reasoning...", status: "complete" },
        { type: "thinking", label: "Generated response", status: "complete" },
        { type: "read", label: "Read file", status: "complete" },
        { type: "todos", label: "Task list", status: "complete" },
        { type: "tool", label: "File change", status: "complete" },
        { type: "reasoning", label: "Thought", status: "complete" },
        { type: "bash", label: "Ran command", status: "complete" },
      ]),
    ).toEqual(["Read files [0,1]", "Edited files [2]", "reasoning: ", "Ran commands [3]"]);
  });

  test("a legacy or malformed log has no segments", () => {
    expect(parseTraceSegments("Ran the tests")).toEqual([]);
    expect(parseTraceSegments(undefined)).toEqual([]);
  });
});
