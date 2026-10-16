import { describe, expect, test } from "vitest";
import { prErrorMessage, toPrDiffData } from "./prReviewQueries";

/** Two files, so the transform has to split rather than pass the text through. */
const DIFF = `diff --git a/src/one.ts b/src/one.ts
index 1111111..2222222 100644
--- a/src/one.ts
+++ b/src/one.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;
diff --git a/src/two.ts b/src/two.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/two.ts
@@ -0,0 +1,2 @@
+export const two = 2;
+export const three = 3;
`;

describe("toPrDiffData", () => {
  test("splits the raw diff into per-file entries and passes the rest through", () => {
    const data = toPrDiffData({
      diff: DIFF,
      truncated: true,
      baseSha: "base",
      headSha: "head",
      workBranch: null,
      repoUrl: "https://github.com/eva/eva",
    });

    expect(data.entries.map((entry) => entry.path)).toEqual([
      "src/one.ts",
      "src/two.ts",
    ]);
    expect(data.entries.map((entry) => entry.status)).toEqual([
      "modified",
      "added",
    ]);
    // Placeholder height estimation reads these, so a bad split shows up here.
    expect(data.entries[0]).toMatchObject({
      additions: 1,
      deletions: 1,
      contextLines: 2,
      hunkCount: 1,
    });
    expect(data).toMatchObject({
      truncated: true,
      baseSha: "base",
      headSha: "head",
      workBranch: null,
      repoUrl: "https://github.com/eva/eva",
    });
  });

  test("an empty diff yields no entries rather than one empty file", () => {
    const data = toPrDiffData({
      diff: "",
      truncated: false,
      baseSha: "base",
      headSha: "head",
      workBranch: null,
      repoUrl: "https://github.com/eva/eva",
    });

    expect(data.entries).toEqual([]);
  });
});

describe("prErrorMessage", () => {
  test("prefers the error's own message, falling back when there is none", () => {
    expect(prErrorMessage(new Error("Not Found"), "fallback")).toBe(
      "Not Found",
    );
    // A rejected action can carry an empty message; the panels still need words.
    expect(prErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(prErrorMessage(null, "fallback")).toBe("fallback");
  });
});
