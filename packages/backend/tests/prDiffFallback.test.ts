import { expect, test } from "bun:test";
import {
  isPrDiffTooLargeError,
  listFileToUnifiedDiff,
} from "../convex/_github/prDiffFallback";

/**
 * Regression cover for fix ca72203f: when a PR exceeds GitHub's 300-file diff
 * media-type ceiling we rebuild the unified diff from `pulls.listFiles`. Both
 * the too-large detection and the per-file diff shape must stay stable, or
 * `@pierre/diffs` fails to parse and the Diffs tab breaks on large PRs.
 */

test("isPrDiffTooLargeError matches GitHub's oversized-diff wordings", () => {
  expect(
    isPrDiffTooLargeError(new Error('{"code":"too_large","message":"..."}')),
  ).toBe(true);
  expect(
    isPrDiffTooLargeError(
      new Error("the diff exceeded the maximum number of files"),
    ),
  ).toBe(true);
  expect(
    isPrDiffTooLargeError(
      new Error("the diff exceeded the maximum number of lines"),
    ),
  ).toBe(true);
});

test("isPrDiffTooLargeError ignores unrelated failures", () => {
  expect(isPrDiffTooLargeError(new Error("Not Found"))).toBe(false);
  expect(isPrDiffTooLargeError(new Error("Bad credentials"))).toBe(false);
});

test("listFileToUnifiedDiff builds an added-file section", () => {
  const diff = listFileToUnifiedDiff({
    filename: "src/new.ts",
    status: "added",
    patch: "@@ -0,0 +1 @@\n+hello",
  });

  expect(diff).toBe(
    [
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1 @@",
      "+hello",
    ].join("\n"),
  );
});

test("listFileToUnifiedDiff builds a removed-file section", () => {
  const diff = listFileToUnifiedDiff({
    filename: "src/gone.ts",
    status: "removed",
    patch: "@@ -1 +0,0 @@\n-bye",
  });

  expect(diff).toBe(
    [
      "diff --git a/src/gone.ts b/src/gone.ts",
      "deleted file mode 100644",
      "--- a/src/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
    ].join("\n"),
  );
});

test("listFileToUnifiedDiff uses previous_filename for renames", () => {
  const diff = listFileToUnifiedDiff({
    filename: "src/after.ts",
    previous_filename: "src/before.ts",
    status: "renamed",
    patch: "@@ -1 +1 @@\n-old\n+new",
  });

  expect(diff).toBe(
    [
      "diff --git a/src/before.ts b/src/after.ts",
      "rename from src/before.ts",
      "rename to src/after.ts",
      "--- a/src/before.ts",
      "+++ b/src/after.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n"),
  );
});

test("listFileToUnifiedDiff builds a modified-file section", () => {
  const diff = listFileToUnifiedDiff({
    filename: "src/edit.ts",
    status: "modified",
    patch: "@@ -1 +1 @@\n-a\n+b",
  });

  expect(diff).toBe(
    [
      "diff --git a/src/edit.ts b/src/edit.ts",
      "--- a/src/edit.ts",
      "+++ b/src/edit.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n"),
  );
});

test("listFileToUnifiedDiff emits a binary marker when patch is absent", () => {
  // GitHub omits `patch` for binary blobs and individually oversized files; the
  // path must still appear so the Diffs tab lists the file.
  const diff = listFileToUnifiedDiff({
    filename: "assets/logo.png",
    status: "modified",
  });

  expect(diff).toBe(
    [
      "diff --git a/assets/logo.png b/assets/logo.png",
      "--- a/assets/logo.png",
      "+++ b/assets/logo.png",
      "Binary files a/assets/logo.png and b/assets/logo.png differ",
    ].join("\n"),
  );
});

test("listFileToUnifiedDiff treats an empty patch like a missing one", () => {
  const diff = listFileToUnifiedDiff({
    filename: "empty.bin",
    status: "modified",
    patch: "",
  });

  expect(diff).toContain(
    "Binary files a/empty.bin and b/empty.bin differ",
  );
});
