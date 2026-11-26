import { expect, test } from "bun:test";
import { PREVIEW_GRANT_PARAM } from "../convex/previewGrantConfig";
import { normalizeStickyPreviewPath } from "../convex/_sandbox/stickyPreview";

test("normalizeStickyPreviewPath always starts with /", () => {
  expect(normalizeStickyPreviewPath("home")).toBe("/home");
  expect(normalizeStickyPreviewPath("")).toBe("/");
});

test("normalizeStickyPreviewPath drops a persisted preview grant", () => {
  expect(
    normalizeStickyPreviewPath(`/?tab=logs&${PREVIEW_GRANT_PARAM}=stale#x`),
  ).toBe("/?tab=logs#x");
  expect(normalizeStickyPreviewPath(`/?${PREVIEW_GRANT_PARAM}=stale`)).toBe(
    "/",
  );
});
