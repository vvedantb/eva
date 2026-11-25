import { describe, it, expect } from "bun:test";
import {
  READ_ONLY_DELIVERABLE_MARKER,
  extractReadOnlyDeliverable,
} from "../convex/_automationWorkflow/deliverable";
import { buildReadOnlyPrompt } from "../convex/_automationWorkflow/prompts";

describe("extractReadOnlyDeliverable", () => {
  it("returns text after the deliverable marker", () => {
    const input = `Today is Monday. Let me read the file.

${READ_ONLY_DELIVERABLE_MARKER}

✨ **New Features**
- Something users can do now.`;

    expect(extractReadOnlyDeliverable(input)).toBe(
      "✨ **New Features**\n- Something users can do now.",
    );
  });

  it("strips a horizontal rule immediately after the marker", () => {
    const input = `${READ_ONLY_DELIVERABLE_MARKER}
---

## Summary
- One change`;

    expect(extractReadOnlyDeliverable(input)).toBe("## Summary\n- One change");
  });

  it("falls back to full text when the marker is missing", () => {
    const input = "No marker — legacy output.";
    expect(extractReadOnlyDeliverable(input)).toBe(input);
  });

  it("returns empty string for empty input", () => {
    expect(extractReadOnlyDeliverable("")).toBe("");
    expect(extractReadOnlyDeliverable("   \n  ")).toBe("");
  });
});

describe("buildReadOnlyPrompt", () => {
  it("includes the deliverable marker and no-preamble rules", () => {
    const prompt = buildReadOnlyPrompt("Weekly report", "List open bugs.", "");
    expect(prompt).toMatch(new RegExp(READ_ONLY_DELIVERABLE_MARKER));
    expect(prompt).toMatch(/No preamble/);
    expect(prompt).not.toMatch(
      /detailed report\/analysis as your final output/,
    );
  });
});
