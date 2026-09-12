import { describe, expect, it } from "vitest";
import {
  applyIgnoreWhitespace,
  buildDiffFileEntries,
  ignoreWhitespaceInPatch,
} from "./diffFiles";

const PROCUREMENTS = "apps/eprocurement/convex/procurements.ts";

function patch(path: string, added: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    "index 1111111..2222222 100644",
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1,1 +1,2 @@",
    " const a = 1;",
    `+${added}`,
  ].join("\n");
}

describe("buildDiffFileEntries", () => {
  it("keeps the first patch when a path is repeated", () => {
    const diff = [
      patch(PROCUREMENTS, "const b = 2;"),
      patch("apps/eprocurement/convex/schema.ts", "const c = 3;"),
      patch(PROCUREMENTS, "const d = 4;"),
    ].join("\n");

    const entries = buildDiffFileEntries(diff);

    expect(entries.map((entry) => entry.path)).toEqual([
      PROCUREMENTS,
      "apps/eprocurement/convex/schema.ts",
    ]);
    expect(entries[0].patch).toContain("const b = 2;");
  });

  it("reads path, status, and counts from each patch", () => {
    const entries = buildDiffFileEntries(patch(PROCUREMENTS, "const b = 2;"));

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(PROCUREMENTS);
    expect(entries[0].status).toBe("modified");
    expect(entries[0].additions).toBe(1);
    expect(entries[0].deletions).toBe(0);
  });
});

describe("ignoreWhitespaceInPatch", () => {
  it("drops a hunk that only changes spaces", () => {
    const source = [
      "diff --git a/app.ts b/app.ts",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,2 +1,2 @@",
      "-const x = 1;",
      "+const  x  =  1;",
      " const y = 2;",
    ].join("\n");

    const filtered = ignoreWhitespaceInPatch(source);
    expect(filtered).not.toContain("-const x = 1;");
    expect(filtered).not.toContain("+const  x  =  1;");
    expect(filtered).not.toContain("@@ ");
  });

  it("keeps a real edit next to a whitespace-only pair", () => {
    const source = [
      "diff --git a/app.ts b/app.ts",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,3 +1,3 @@",
      "-const x = 1;",
      "+const  x  =  1;",
      "-return a;",
      "+return b;",
    ].join("\n");

    const filtered = ignoreWhitespaceInPatch(source);
    expect(filtered).toContain("@@ ");
    expect(filtered).toContain("-return a;");
    expect(filtered).toContain("+return b;");
    expect(filtered).not.toContain("-const x = 1;");
  });

  it("recomputes +/- after ignore-whitespace", () => {
    const source = [
      "diff --git a/app.ts b/app.ts",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -1,2 +1,2 @@",
      "-const x = 1;",
      "+const  x  =  1;",
      "-return a;",
      "+return b;",
    ].join("\n");
    const [entry] = applyIgnoreWhitespace(buildDiffFileEntries(source));
    expect(entry.additions).toBe(1);
    expect(entry.deletions).toBe(1);
  });
});
