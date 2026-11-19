import { describe, expect, test } from "vitest";
import {
  assessMergeRisk,
  formatMergeRisk,
  insertMergeRisk,
  type ChangedFile,
} from "../convex/_github/mergeRisk";

const file = (filename: string, extra: Partial<ChangedFile> = {}): ChangedFile => ({
  filename,
  status: "modified",
  additions: 5,
  deletions: 1,
  ...extra,
});

describe("assessMergeRisk", () => {
  test("ordinary UI changes are low risk", () => {
    const risk = assessMergeRisk([
      file("apps/web/src/components/Button.tsx"),
      file("docs/author-guide.md"),
    ]);
    expect(risk).toEqual({ level: "low", findings: [] });
  });

  test("migrations, auth and billing are high; high findings come first", () => {
    const risk = assessMergeRisk([
      file("package.json"),
      file("prisma/migrations/20261111_drop_col/migration.sql"),
      file("src/auth/session.ts"),
      file("src/billing/invoice.ts"),
    ]);
    expect(risk.level).toBe("high");
    expect(risk.findings.map((f) => f.level)).toEqual([
      "high",
      "high",
      "high",
      "medium",
    ]);
  });

  test("added lines that swallow errors are flagged; removed ones are not", () => {
    const swallowed = assessMergeRisk([
      file("src/a.ts", { patch: "@@ -1 +1 @@\n+  } catch {}\n" }),
      file("src/b.ts", { patch: "@@ -1 +1 @@\n+save().catch(() => {});\n" }),
      file("src/c.py", { patch: "@@ -1 +1 @@\n+except Exception: pass\n" }),
    ]);
    expect(swallowed.findings[0]?.paths).toEqual(["src/a.ts", "src/b.ts", "src/c.py"]);

    const removed = assessMergeRisk([
      file("src/a.ts", { patch: "@@ -1 +1 @@\n-  } catch {}\n" }),
    ]);
    expect(removed.level).toBe("low");
  });

  test("a large change is medium even on safe paths", () => {
    const risk = assessMergeRisk([file("src/big.ts", { additions: 900 })]);
    expect(risk.level).toBe("medium");
  });
});

describe("merge risk block", () => {
  test("lists at most three paths, and is replaced in place on the next push", () => {
    const risk = assessMergeRisk(
      ["a", "b", "c", "d"].map((name) => file(`db/migrations/${name}.sql`)),
    );
    expect(formatMergeRisk(risk)).toContain("and 1 more");

    const footer = "\n---\nOpened by Eva";
    const once = insertMergeRisk(`## Task\nFix it${footer}`, risk);
    const twice = insertMergeRisk(once, assessMergeRisk([]));
    expect(twice).toContain("### Merge risk: Low");
    expect(twice).not.toContain("Merge risk: High");
    expect(twice.endsWith("Opened by Eva")).toBe(true);
  });
});
