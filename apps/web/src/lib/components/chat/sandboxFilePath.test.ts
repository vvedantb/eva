import { expect, test } from "vitest";
import {
  toRepoRelativePath,
  toSandboxFilePath,
} from "./ChangedFilesCard";

test("toSandboxFilePath prefixes repo-relative paths for ?file=", () => {
  expect(toSandboxFilePath("apps/web/src/billing/InvoiceList.tsx")).toBe(
    "/tmp/repo/apps/web/src/billing/InvoiceList.tsx",
  );
  expect(toSandboxFilePath("/tmp/repo/apps/web/src/foo.tsx")).toBe(
    "/tmp/repo/apps/web/src/foo.tsx",
  );
  expect(
    toRepoRelativePath(toSandboxFilePath("apps/web/src/foo.tsx")),
  ).toBe("apps/web/src/foo.tsx");
});
