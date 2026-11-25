import { describe, expect, it } from "bun:test";
import {
  rankSandboxFiles,
  sandboxFileDirectory,
  sandboxFileName,
} from "./sandboxFileSearch";

const PATHS = [
  "apps/web/src/App.tsx",
  "apps/web/src/components/ActionPalette.tsx",
  "apps/mobile/src/App.tsx",
  "packages/backend/convex/actions.ts",
];

describe("rankSandboxFiles", () => {
  it("prioritizes exact and prefix filename matches", () => {
    expect(rankSandboxFiles(PATHS, "app", 3)).toEqual([
      "apps/web/src/App.tsx",
      "apps/mobile/src/App.tsx",
      "apps/web/src/components/ActionPalette.tsx",
    ]);
  });

  it("supports path tokens and fuzzy subsequences", () => {
    expect(rankSandboxFiles(PATHS, "mobile app", 3)).toEqual([
      "apps/mobile/src/App.tsx",
    ]);
    expect(rankSandboxFiles(PATHS, "actplt", 3)).toEqual([
      "apps/web/src/components/ActionPalette.tsx",
    ]);
  });

  it("limits an empty query without sorting the source list", () => {
    expect(rankSandboxFiles(PATHS, "", 2)).toEqual(PATHS.slice(0, 2));
  });
});

describe("sandbox file path labels", () => {
  it("splits a path into filename and directory", () => {
    expect(sandboxFileName("apps/web/src/App.tsx")).toBe("App.tsx");
    expect(sandboxFileDirectory("apps/web/src/App.tsx")).toBe("apps/web/src");
  });
});
