import { describe, expect, it } from "vitest";
import {
  IGNORED_FILE_NAMES,
  MAX_HUNK_CHARS,
  splitDiffIntoHunks,
} from "../convex/_scopeCheck/hunks";

/**
 * The motivating case: a file the prompt did ask about, plus a hunk in it that
 * swaps an icon nobody asked for. The splitter has to hand the icon swap over
 * as its own hunk or the whole feature is pointless.
 */
const ICON_SWAP_DIFF = `diff --git a/apps/web/src/components/SettingsPanel.tsx b/apps/web/src/components/SettingsPanel.tsx
index 1111111..2222222 100644
--- a/apps/web/src/components/SettingsPanel.tsx
+++ b/apps/web/src/components/SettingsPanel.tsx
@@ -1,5 +1,5 @@
 import { useId } from "react";
-import { IconSettings } from "@tabler/icons-react";
+import { IconSparkles } from "@tabler/icons-react";

 import { Panel } from "./Panel";
@@ -20,7 +20,9 @@ export function SettingsPanel() {
   return (
     <Panel>
-      <h2>Settings</h2>
+      <h2>{title}</h2>
+      <p>{description}</p>
     </Panel>
   );
 }
diff --git a/apps/web/src/components/Panel.tsx b/apps/web/src/components/Panel.tsx
index 3333333..4444444 100644
--- a/apps/web/src/components/Panel.tsx
+++ b/apps/web/src/components/Panel.tsx
@@ -4,3 +4,4 @@ export function Panel({ children }: Props) {
   return <section>{children}</section>;
 }
+// trailing comment
`;

describe("splitDiffIntoHunks", () => {
  it("returns every hunk of every file, in diff order", () => {
    const hunks = splitDiffIntoHunks(ICON_SWAP_DIFF);
    expect(hunks.map((hunk) => hunk.file)).toEqual([
      "apps/web/src/components/SettingsPanel.tsx",
      "apps/web/src/components/SettingsPanel.tsx",
      "apps/web/src/components/Panel.tsx",
    ]);
    expect(hunks.map((hunk) => hunk.header)).toEqual([
      "@@ -1,5 +1,5 @@",
      "@@ -20,7 +20,9 @@ export function SettingsPanel() {",
      "@@ -4,3 +4,4 @@ export function Panel({ children }: Props) {",
    ]);
  });

  it("isolates the unasked-for icon swap in its own hunk", () => {
    const [iconHunk] = splitDiffIntoHunks(ICON_SWAP_DIFF);
    expect(iconHunk.body).toContain("-import { IconSettings }");
    expect(iconHunk.body).toContain("+import { IconSparkles }");
    // The legitimate edit lower in the same file must not ride along.
    expect(iconHunk.body).not.toContain("<p>{description}</p>");
  });

  it("keeps the file header and path lines out of the body", () => {
    const [iconHunk] = splitDiffIntoHunks(ICON_SWAP_DIFF);
    expect(iconHunk.body).not.toContain("+++ b/");
    expect(iconHunk.body).not.toContain("index 1111111");
    expect(iconHunk.body.split("\n")[0]).toBe(
      ' import { useId } from "react";',
    );
  });

  it("names a deleted file by its old-side path", () => {
    const diff = `diff --git a/src/legacy.ts b/src/legacy.ts
deleted file mode 100644
index 5555555..0000000
--- a/src/legacy.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const gone = true;
-
`;
    const hunks = splitDiffIntoHunks(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].file).toBe("src/legacy.ts");
  });

  it("keeps the no-newline marker in the body", () => {
    const diff = `diff --git a/src/a.txt b/src/a.txt
--- a/src/a.txt
+++ b/src/a.txt
@@ -1 +1 @@
-old
+new
\\ No newline at end of file
`;
    const [hunk] = splitDiffIntoHunks(diff);
    expect(hunk.body).toContain("\\ No newline at end of file");
  });

  it("skips binary blocks", () => {
    const diff = `diff --git a/logo.png b/logo.png
index 6666666..7777777 100644
Binary files a/logo.png and b/logo.png differ
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-a
+b
`;
    expect(splitDiffIntoHunks(diff).map((hunk) => hunk.file)).toEqual([
      "src/a.ts",
    ]);
  });

  it("skips a GIT binary patch block", () => {
    const diff = `diff --git a/logo.png b/logo.png
index 6666666..7777777 100644
GIT binary patch
literal 12
zcmZ?wbhEHb
@@ -1 +1 @@
-not really a hunk
`;
    expect(splitDiffIntoHunks(diff)).toEqual([]);
  });

  it("skips lockfiles wherever they sit in the tree", () => {
    expect(IGNORED_FILE_NAMES.has("pnpm-lock.yaml")).toBe(true);
    const diff = `diff --git a/packages/backend/pnpm-lock.yaml b/packages/backend/pnpm-lock.yaml
--- a/packages/backend/pnpm-lock.yaml
+++ b/packages/backend/pnpm-lock.yaml
@@ -10,6 +10,7 @@ importers:
+      zod: 3.24.0
`;
    expect(splitDiffIntoHunks(diff)).toEqual([]);
  });

  it("yields nothing for a rename with no hunks", () => {
    const diff = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts
`;
    expect(splitDiffIntoHunks(diff)).toEqual([]);
  });

  it("clips a long body on a line boundary and says so", () => {
    const line = "+".padEnd(80, "x");
    const long = Array.from({ length: 200 }, () => line).join("\n");
    const diff = `diff --git a/src/big.ts b/src/big.ts
--- a/src/big.ts
+++ b/src/big.ts
@@ -1,200 +1,200 @@
${long}
`;
    const [hunk] = splitDiffIntoHunks(diff);
    expect(hunk.body.endsWith("\n… (hunk truncated)")).toBe(true);
    const kept = hunk.body.slice(0, -"\n… (hunk truncated)".length);
    expect(kept.length).toBeLessThanOrEqual(MAX_HUNK_CHARS);
    // Clipped between lines, never mid-line.
    for (const bodyLine of kept.split("\n")) {
      expect(bodyLine).toBe(line);
    }
  });

  it("leaves a short body unclipped", () => {
    const [hunk] = splitDiffIntoHunks(ICON_SWAP_DIFF);
    expect(hunk.body).not.toContain("hunk truncated");
  });

  it("returns nothing for empty or non-diff input", () => {
    expect(splitDiffIntoHunks("")).toEqual([]);
    expect(splitDiffIntoHunks("not a diff at all\njust prose\n")).toEqual([]);
    expect(splitDiffIntoHunks("@@ -1 +1 @@\n-a\n+b\n")).toEqual([]);
  });
});
