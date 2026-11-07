import { describe, expect, test } from "vitest";
import { parseToolSteps, summariseToolSteps } from "@eva/shared/activityTrace";

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

  test("legacy plain text, empty and missing logs give no steps", () => {
    expect(parseToolSteps("Ran the tests")).toEqual([]);
    expect(parseToolSteps("[]")).toEqual([]);
    expect(parseToolSteps(undefined)).toEqual([]);
  });
});
