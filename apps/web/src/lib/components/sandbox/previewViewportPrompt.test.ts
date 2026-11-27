import { describe, expect, test } from "bun:test";
import {
  appendPreviewViewportToPrompt,
  formatPreviewViewportPrompt,
} from "./previewViewportPrompt";

describe("preview viewport prompt", () => {
  test("names the device when the size came from a preset", () => {
    expect(
      formatPreviewViewportPrompt({
        width: 390,
        height: 844,
        label: "iPhone 12 Pro",
      }),
    ).toContain("390×844 CSS px (iPhone 12 Pro)");
  });

  test("appends the note after the typed text", () => {
    const out = appendPreviewViewportToPrompt("Make it taller", {
      width: 500,
      height: 700,
      label: undefined,
    });
    expect(out.startsWith("Make it taller\n\n<preview_viewport>")).toBe(true);
    expect(out).toContain("500×700 CSS px.");
  });

  test("leaves the prompt alone with no custom size or no text", () => {
    expect(appendPreviewViewportToPrompt("hi", null)).toBe("hi");
    expect(
      appendPreviewViewportToPrompt("", {
        width: 1,
        height: 1,
        label: undefined,
      }),
    ).toBe("");
  });
});
