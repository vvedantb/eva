import { describe, expect, test, vi } from "vitest";
import {
  openChangedFile,
  toRepoRelativePath,
} from "@/lib/components/chat/ChangedFilesCard";

describe("openChangedFile", () => {
  test("prefers Review diffs with a repo-relative path", () => {
    const onViewDiff = vi.fn();
    const onOpenFile = vi.fn();
    openChangedFile("/tmp/repo/internal/changelog/2026-09.md", {
      onViewDiff,
      onOpenFile,
    });
    expect(onViewDiff).toHaveBeenCalledWith("internal/changelog/2026-09.md");
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  test("falls back to the File Viewer when diffs are unavailable", () => {
    const onOpenFile = vi.fn();
    openChangedFile("/tmp/repo/apps/web/src/main.tsx", { onOpenFile });
    expect(onOpenFile).toHaveBeenCalledWith("/tmp/repo/apps/web/src/main.tsx");
  });

  test("toRepoRelativePath leaves already-relative paths alone", () => {
    expect(toRepoRelativePath("apps/web/src/main.tsx")).toBe(
      "apps/web/src/main.tsx",
    );
  });
});
