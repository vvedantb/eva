import { describe, expect, it } from "vitest";
import {
  isSessionSandboxTab,
  isTaskRouteSandboxTab,
  parseDiffSearchFields,
  sandboxTabIdFromParam,
  splitCorruptedSandboxTabParam,
} from "./search-params";

describe("isTaskRouteSandboxTab", () => {
  it("accepts real task sandbox tabs", () => {
    expect(isTaskRouteSandboxTab("review")).toBe(true);
    expect(isTaskRouteSandboxTab("pr")).toBe(false);
    expect(isTaskRouteSandboxTab("browser")).toBe(true);
    expect(isTaskRouteSandboxTab("files")).toBe(true);
    expect(isTaskRouteSandboxTab("artifacts")).toBe(true);
    expect(isTaskRouteSandboxTab("documents")).toBe(true);
    expect(isTaskRouteSandboxTab("terminal")).toBe(false);
  });

  it("rejects legacy diffs and corrupted segments", () => {
    expect(isTaskRouteSandboxTab("diffs")).toBe(false);
    expect(
      isTaskRouteSandboxTab(
        "diffs?diffFile=apps%2Fweb%2Fapp%2F(commissioner)%2Flist%2FCHCard.tsx",
      ),
    ).toBe(false);
    expect(isTaskRouteSandboxTab("diffs?diffView=split")).toBe(false);
  });
});

describe("isSessionSandboxTab", () => {
  it("keeps terminals out of the right-panel route vocabulary", () => {
    expect(isSessionSandboxTab("preview")).toBe(true);
    expect(isSessionSandboxTab("artifacts")).toBe(true);
    expect(isSessionSandboxTab("documents")).toBe(true);
    expect(isSessionSandboxTab("terminal")).toBe(false);
  });
});

describe("splitCorruptedSandboxTabParam", () => {
  it("returns null for clean tabs", () => {
    expect(splitCorruptedSandboxTabParam("diffs")).toBeNull();
    expect(splitCorruptedSandboxTabParam("preview")).toBeNull();
  });

  it("peels tab and diff search from a corrupted segment", () => {
    const path = "apps/web/app/(commissioner)/care_homes/list/CHCard.tsx";
    const encoded = encodeURIComponent(path);
    expect(
      splitCorruptedSandboxTabParam(`diffs?diffFile=${encoded}&diffView=split`),
    ).toEqual({
      tab: "diffs",
      diffFile: path,
      diffView: "split",
      file: undefined,
    });
  });

  it("decodes once-encoded slash paths from URLSearchParams", () => {
    // How TanStack/qss typically serializes paths (slashes as %2F).
    expect(
      splitCorruptedSandboxTabParam("diffs?diffFile=apps%2Fweb%2Ffoo.tsx"),
    ).toEqual({
      tab: "diffs",
      diffFile: "apps/web/foo.tsx",
      diffView: undefined,
      file: undefined,
    });
  });

  it("peels a file-viewer path trapped in the files tab", () => {
    expect(
      splitCorruptedSandboxTabParam(
        "files?file=/vercel/sandbox/apps/web/src/foo.tsx",
      ),
    ).toEqual({
      tab: "files",
      diffFile: undefined,
      diffView: undefined,
      file: "/vercel/sandbox/apps/web/src/foo.tsx",
    });
  });
});

describe("sandboxTabIdFromParam", () => {
  it("returns a clean tab id when nuqs stuffed search into the segment", () => {
    expect(
      sandboxTabIdFromParam("files?file=/vercel/sandbox/package.json"),
    ).toBe("files");
    expect(sandboxTabIdFromParam("preview")).toBe("preview");
  });
});

describe("parseDiffSearchFields", () => {
  it("keeps only valid Diffs/PR search keys", () => {
    expect(
      parseDiffSearchFields({
        diffFile: "apps/web/foo.tsx",
        diffView: "split",
        prTab: "recap",
      }),
    ).toEqual({
      diffFile: "apps/web/foo.tsx",
      diffView: "split",
      prTab: "recap",
    });

    expect(
      parseDiffSearchFields({
        prTab: "overview",
      }),
    ).toEqual({
      diffFile: undefined,
      diffView: undefined,
      prTab: "overview",
    });

    expect(parseDiffSearchFields({ diffView: "nope", prTab: "junk" })).toEqual({
      diffFile: undefined,
      diffView: undefined,
      prTab: undefined,
    });
  });
});
