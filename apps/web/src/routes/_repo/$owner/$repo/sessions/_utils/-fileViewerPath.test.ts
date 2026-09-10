import { describe, expect, it } from "vitest";
import {
  fileBreadcrumbSegments,
  repoRelativeName,
} from "./-fileViewerPath";

const ROOT = "/vercel/sandbox";

describe("repoRelativeName", () => {
  it("strips the sandbox root", () => {
    expect(repoRelativeName(`${ROOT}/apps/web/src/App.tsx`, ROOT)).toBe(
      "apps/web/src/App.tsx",
    );
  });

  it("keeps the absolute path when there is no root", () => {
    expect(repoRelativeName(`${ROOT}/App.tsx`, null)).toBe(
      "/vercel/sandbox/App.tsx",
    );
  });

  it("keeps the absolute path for files outside the root", () => {
    expect(repoRelativeName("/tmp/build.log", ROOT)).toBe("/tmp/build.log");
  });

  it("ignores a trailing slash on the root", () => {
    expect(repoRelativeName(`${ROOT}/README.md`, `${ROOT}/`)).toBe("README.md");
  });

  it("keeps the root itself rather than returning an empty name", () => {
    expect(repoRelativeName(ROOT, ROOT)).toBe(ROOT);
  });

  it("normalizes backslashes", () => {
    expect(repoRelativeName(`${ROOT}\\apps\\web\\App.tsx`, ROOT)).toBe(
      "apps/web/App.tsx",
    );
  });
});

describe("fileBreadcrumbSegments", () => {
  it("marks only the last segment as the file", () => {
    expect(fileBreadcrumbSegments(`${ROOT}/apps/web/App.tsx`, ROOT)).toEqual([
      { label: "apps", isFile: false },
      { label: "web", isFile: false },
      { label: "App.tsx", isFile: true },
    ]);
  });

  it("walks the absolute path when the file is outside the root", () => {
    expect(fileBreadcrumbSegments("/tmp/build.log", ROOT)).toEqual([
      { label: "tmp", isFile: false },
      { label: "build.log", isFile: true },
    ]);
  });

  it("handles a file directly at the root", () => {
    expect(fileBreadcrumbSegments(`${ROOT}/README.md`, ROOT)).toEqual([
      { label: "README.md", isFile: true },
    ]);
  });

  it("returns nothing for an empty path", () => {
    expect(fileBreadcrumbSegments("", null)).toEqual([]);
  });
});
