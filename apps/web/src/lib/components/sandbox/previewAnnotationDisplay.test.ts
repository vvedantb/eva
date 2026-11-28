import { describe, expect, test } from "bun:test";
import {
  buildAnnotationDisplay,
  parseAnnotationDisplay,
} from "@eva/shared/previewAnnotationDisplay";

describe("preview annotation display text", () => {
  test("parses back what it builds", () => {
    const ref = { pagePath: "/settings/billing", element: "<table.invoices>" };
    const text = buildAnnotationDisplay("  Sort newest first.\nThanks ", ref);
    expect(parseAnnotationDisplay(text)).toEqual({
      feedback: "Sort newest first.\nThanks",
      ...ref,
    });
  });

  test("ignores a plain chat message", () => {
    expect(parseAnnotationDisplay("Fix the header please")).toBeNull();
    expect(parseAnnotationDisplay("[Annotated <div> on /]")).toBeNull();
  });
});
