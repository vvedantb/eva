import { describe, expect, test } from "bun:test";
import {
  PREVIEW_PATH_HISTORY_STORED_LIMIT,
  PREVIEW_PATH_HISTORY_VISIBLE_LIMIT,
  filterPreviewPathHistory,
  normalizePreviewPath,
  parsePreviewPathHistoryJson,
  previewPathHistoryStorageKey,
  recordPreviewPath,
} from "./previewPathHistory";

describe("previewPathHistoryStorageKey", () => {
  test("namespaces recents per repo", () => {
    expect(previewPathHistoryStorageKey("repo_abc")).toBe(
      "eva:preview-path-history:v1:repo_abc",
    );
  });
});

describe("normalizePreviewPath", () => {
  test("adds a leading slash and trims", () => {
    expect(normalizePreviewPath(" settings ")).toBe("/settings");
  });

  test("empty input becomes root", () => {
    expect(normalizePreviewPath("   ")).toBe("/");
  });
});

describe("parsePreviewPathHistoryJson", () => {
  test("reads a valid recent list", () => {
    expect(parsePreviewPathHistoryJson('["/settings","/login"]')).toEqual([
      "/settings",
      "/login",
    ]);
  });

  test("drops root, duplicates, and unsashed entries after normalize", () => {
    expect(
      parsePreviewPathHistoryJson('["/","settings","/settings","/login"]'),
    ).toEqual(["/settings", "/login"]);
  });

  test("returns empty for corrupt storage", () => {
    expect(parsePreviewPathHistoryJson("{")).toEqual([]);
    expect(parsePreviewPathHistoryJson('{"path":"/x"}')).toEqual([]);
    expect(parsePreviewPathHistoryJson("[1,2]")).toEqual([]);
  });
});

describe("recordPreviewPath", () => {
  test("skips root", () => {
    expect(recordPreviewPath(["/login"], "/")).toEqual(["/login"]);
    expect(recordPreviewPath(["/login"], "  ")).toEqual(["/login"]);
  });

  test("moves a revisited path to the front", () => {
    expect(recordPreviewPath(["/a", "/b", "/c"], "/b")).toEqual([
      "/b",
      "/a",
      "/c",
    ]);
  });

  test("caps stored recents", () => {
    const history = Array.from(
      { length: PREVIEW_PATH_HISTORY_STORED_LIMIT },
      (_, i) => `/p${i}`,
    );
    const next = recordPreviewPath(history, "/newest");
    expect(next).toHaveLength(PREVIEW_PATH_HISTORY_STORED_LIMIT);
    expect(next[0]).toBe("/newest");
    expect(next).not.toContain("/p29");
  });
});

describe("filterPreviewPathHistory", () => {
  const history = [
    "/settings",
    "/login",
    "/dashboard",
    "/docs",
    "/docs/api",
    "/about",
  ];

  test("empty query returns the most recent visible cap", () => {
    expect(filterPreviewPathHistory(history, "")).toEqual(
      history.slice(0, PREVIEW_PATH_HISTORY_VISIBLE_LIMIT),
    );
    expect(filterPreviewPathHistory(history, "  ")).toHaveLength(
      PREVIEW_PATH_HISTORY_VISIBLE_LIMIT,
    );
  });

  test("filters by case-insensitive substring and still caps at 5", () => {
    expect(filterPreviewPathHistory(history, "DOC")).toEqual([
      "/docs",
      "/docs/api",
    ]);
    const many = Array.from({ length: 12 }, (_, i) => `/docs/${i}`);
    expect(filterPreviewPathHistory(many, "docs")).toHaveLength(
      PREVIEW_PATH_HISTORY_VISIBLE_LIMIT,
    );
  });
});
