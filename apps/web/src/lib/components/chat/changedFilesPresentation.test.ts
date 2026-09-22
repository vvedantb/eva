import { describe, expect, it } from "vitest";
import {
  type ChangedFile,
  workspaceRepoName,
} from "@/lib/components/chat/ChangedFilesCard";
import {
  groupChangedFilesByRepo,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  shouldPreviewChangedFiles,
} from "@/lib/components/chat/changedFilesPresentation";

function file(path: string, repoName: string | null = null): ChangedFile {
  const segments = path.split("/");
  return {
    path,
    name: segments.at(-1) ?? path,
    dir: segments.slice(0, -1).join("/"),
    repoName,
  };
}

describe("changed files presentation", () => {
  it("expands only small latest-turn summaries", () => {
    const small = [file("apps/web/a.ts"), file("packages/ui/b.ts")];
    const large = Array.from({ length: 6 }, (_, index) =>
      file(`apps/web/${index}.ts`),
    );

    expect(shouldAutoExpandChangedFiles(small, true)).toBe(true);
    expect(shouldAutoExpandChangedFiles(small, false)).toBe(false);
    expect(shouldAutoExpandChangedFiles(large, true)).toBe(false);
    expect(shouldPreviewChangedFiles(small, true)).toBe(false);
    expect(shouldPreviewChangedFiles(large, true)).toBe(true);
    expect(shouldPreviewChangedFiles(large, false)).toBe(false);
  });

  it("previews distinct top-level scopes before filling remaining slots", () => {
    const files = [
      file("/tmp/repo/apps/web/a.ts"),
      file("/tmp/repo/apps/web/b.ts"),
      file("/tmp/repo/packages/ui/c.ts"),
      file("/tmp/repo/docs/d.md"),
    ];

    expect(selectChangedFilePreview(files).map((entry) => entry.path)).toEqual([
      "/tmp/repo/apps/web/a.ts",
      "/tmp/repo/packages/ui/c.ts",
      "/tmp/repo/docs/d.md",
    ]);
  });

  it("derives a repo name from a workspace-prefixed path, else null", () => {
    expect(workspaceRepoName("/tmp/workspace/frontend/src/a.ts")).toBe(
      "frontend",
    );
    expect(workspaceRepoName("/tmp/repo/src/a.ts")).toBeNull();
    expect(workspaceRepoName("/workspace/repo/src/a.ts")).toBeNull();
    // No file segment after the repo name — not a real file path.
    expect(workspaceRepoName("/tmp/workspace/frontend")).toBeNull();
  });

  it("groups files by linked repo, primary first and un-grouped", () => {
    const files = [
      file("/tmp/repo/apps/web/a.ts", null),
      file("/tmp/workspace/api/src/b.ts", "api"),
      file("/tmp/repo/docs/c.md", null),
      file("/tmp/workspace/api/src/d.ts", "api"),
      file("/tmp/workspace/worker/e.ts", "worker"),
    ];

    const groups = groupChangedFilesByRepo(files);

    expect(groups.map((group) => group.repoName)).toEqual([
      null,
      "api",
      "worker",
    ]);
    expect(groups[0]?.files.map((f) => f.path)).toEqual([
      "/tmp/repo/apps/web/a.ts",
      "/tmp/repo/docs/c.md",
    ]);
    expect(groups[1]?.files.map((f) => f.path)).toEqual([
      "/tmp/workspace/api/src/b.ts",
      "/tmp/workspace/api/src/d.ts",
    ]);
    expect(groups[2]?.files.map((f) => f.path)).toEqual([
      "/tmp/workspace/worker/e.ts",
    ]);
  });

  it("a single-repo file list groups into exactly one, primary group", () => {
    const files = [file("/tmp/repo/a.ts"), file("/tmp/repo/b.ts")];
    expect(groupChangedFilesByRepo(files)).toEqual([
      { repoName: null, files },
    ]);
  });
});
