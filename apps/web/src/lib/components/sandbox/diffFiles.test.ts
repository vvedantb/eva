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

interface HunkHeaderCounts {
  /** `-old,DECLARED +new,DECLARED` as written in the `@@` header. */
  readonly declared: readonly [number, number];
  /** Old/new line totals counted from the hunk body that follows it. */
  readonly actual: [number, number];
}

/**
 * Re-derives each hunk's old/new line totals from its body, so a test can
 * assert the re-emitted `@@` header still describes what it precedes — the
 * patch parser rejects a hunk whose counts disagree with its contents.
 */
function hunkHeaderCounts(patch: string): HunkHeaderCounts[] {
  const headers: HunkHeaderCounts[] = [];
  for (const line of patch.split("\n")) {
    const match = line.match(/^@@ -\d+,(\d+) \+\d+,(\d+) @@/);
    if (match) {
      headers.push({
        declared: [Number(match[1]), Number(match[2])],
        actual: [0, 0],
      });
      continue;
    }
    const current = headers.at(-1);
    if (!current) continue;
    if (line.startsWith("-")) current.actual[0] += 1;
    else if (line.startsWith("+")) current.actual[1] += 1;
    else if (line.startsWith(" ")) {
      current.actual[0] += 1;
      current.actual[1] += 1;
    }
  }
  return headers;
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

  // Lines whose own content starts with `-`/`+` used to be misread as the
  // `---`/`+++` file markers and demoted to context, which deleted the change
  // from the rendered diff.
  it("keeps a deleted `---` front-matter separator", () => {
    const source = [
      "diff --git a/docs/post.md b/docs/post.md",
      "index 1111111..2222222 100644",
      "--- a/docs/post.md",
      "+++ b/docs/post.md",
      "@@ -1,4 +1,3 @@",
      "----",
      " title: Post",
      " ---",
      " body",
    ].join("\n");

    const filtered = ignoreWhitespaceInPatch(source);
    expect(filtered).toContain("@@ -1,4 +1,3 @@");
    expect(filtered.split("\n")).toContain("----");
  });

  it("keeps a deleted `--brand: red;` custom property", () => {
    const source = [
      "diff --git a/app.css b/app.css",
      "index 1111111..2222222 100644",
      "--- a/app.css",
      "+++ b/app.css",
      "@@ -1,3 +1,2 @@",
      " :root {",
      "---brand: red;",
      " }",
    ].join("\n");

    const filtered = ignoreWhitespaceInPatch(source);
    expect(filtered.split("\n")).toContain("---brand: red;");

    const [entry] = applyIgnoreWhitespace(buildDiffFileEntries(source));
    expect(entry.deletions).toBe(1);
  });

  it("keeps an added `++i`", () => {
    const source = [
      "diff --git a/loop.ts b/loop.ts",
      "index 1111111..2222222 100644",
      "--- a/loop.ts",
      "+++ b/loop.ts",
      "@@ -1,2 +1,3 @@",
      " while (x) {",
      "+++i;",
      " }",
    ].join("\n");

    const filtered = ignoreWhitespaceInPatch(source);
    expect(filtered.split("\n")).toContain("+++i;");

    const [entry] = applyIgnoreWhitespace(buildDiffFileEntries(source));
    expect(entry.additions).toBe(1);
  });

  it("keeps the emitted hunk header counts consistent", () => {
    const source = [
      "diff --git a/app.ts b/app.ts",
      "index 1111111..2222222 100644",
      "--- a/app.ts",
      "+++ b/app.ts",
      "@@ -10,5 +10,5 @@ function run() {",
      " const before = 0;",
      "-const x = 1;",
      "-const gone = 2;",
      "+const  x  =  1;",
      " const after = 3;",
      "+const added = 4;",
      " const last = 5;",
    ].join("\n");

    const headers = hunkHeaderCounts(ignoreWhitespaceInPatch(source));
    expect(headers).toHaveLength(1);
    for (const { declared, actual } of headers) {
      expect(actual).toEqual(declared);
    }
  });
});

describe("applyIgnoreWhitespace", () => {
  it("drops a file whose only change is re-spacing", () => {
    const source = [
      [
        "diff --git a/spaced.ts b/spaced.ts",
        "index 1111111..2222222 100644",
        "--- a/spaced.ts",
        "+++ b/spaced.ts",
        "@@ -1,2 +1,2 @@",
        "-const x = 1;",
        "+const  x  =  1;",
        " const y = 2;",
      ].join("\n"),
      [
        "diff --git a/real.ts b/real.ts",
        "index 3333333..4444444 100644",
        "--- a/real.ts",
        "+++ b/real.ts",
        "@@ -1,2 +1,2 @@",
        "-return a;",
        "+return b;",
        " const y = 2;",
      ].join("\n"),
    ].join("\n");

    const entries = applyIgnoreWhitespace(buildDiffFileEntries(source));

    expect(entries.map((entry) => entry.path)).toEqual(["real.ts"]);
  });

  it("leaves a whitespace-only binary or header-only file alone", () => {
    const source = [
      "diff --git a/moved.ts b/kept.ts",
      "similarity index 100%",
      "rename from moved.ts",
      "rename to kept.ts",
    ].join("\n");

    const entries = applyIgnoreWhitespace(buildDiffFileEntries(source));

    expect(entries.map((entry) => entry.path)).toEqual(["kept.ts"]);
  });
});
