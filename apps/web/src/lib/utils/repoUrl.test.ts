import { describe, expect, it } from "bun:test";
import {
  hrefToNavigateOptions,
  repoHref,
  repoPublicHref,
  repoSectionFromPath,
  repoSectionHref,
  toDisplayRepoHref,
  toInternalRepoHref,
} from "./repoUrl";

describe("repoUrl monorepo slash rewrite", () => {
  it("repoHref is the public slash form", () => {
    expect(repoHref("evalucom", "carepulse-ts", "apps/web")).toBe(
      "/evalucom/carepulse-ts/web",
    );
  });

  it("round-trips slash ↔ dash", () => {
    const slash = "/evalucom/carepulse-ts/web/quick-tasks/204";
    const dash = "/evalucom/carepulse-ts--web/quick-tasks/204";
    expect(toInternalRepoHref(slash)).toBe(dash);
    expect(toDisplayRepoHref(dash)).toBe(slash);
  });

  it("does not treat repo sections as app names", () => {
    expect(toInternalRepoHref("/evalucom/carepulse-ts/quick-tasks")).toBe(
      "/evalucom/carepulse-ts/quick-tasks",
    );
    expect(toInternalRepoHref("/evalucom/carepulse-ts/drafts")).toBe(
      "/evalucom/carepulse-ts/drafts",
    );
  });

  it("preserves the query/hash suffix in both directions", () => {
    expect(
      toInternalRepoHref("/evalucom/carepulse-ts/web/quick-tasks/204?draft=1"),
    ).toBe("/evalucom/carepulse-ts--web/quick-tasks/204?draft=1");
    expect(
      toDisplayRepoHref("/evalucom/carepulse-ts--web/sessions#thread-9"),
    ).toBe("/evalucom/carepulse-ts/web/sessions#thread-9");
  });

  it("leaves global (non-repo) prefixes untouched", () => {
    expect(toInternalRepoHref("/teams/design/activity")).toBe(
      "/teams/design/activity",
    );
    expect(toInternalRepoHref("/settings/profile/edit")).toBe(
      "/settings/profile/edit",
    );
  });

  it("does not double-encode an already-internal dash href", () => {
    expect(toInternalRepoHref("/evalucom/carepulse-ts--web/dashboard")).toBe(
      "/evalucom/carepulse-ts--web/dashboard",
    );
  });

  it("leaves single-repo hrefs unchanged", () => {
    expect(toDisplayRepoHref("/evalucom/carepulse-ts/sessions")).toBe(
      "/evalucom/carepulse-ts/sessions",
    );
    expect(toInternalRepoHref("/evalucom/carepulse-ts/sessions")).toBe(
      "/evalucom/carepulse-ts/sessions",
    );
  });

  it("reads the repo section from either URL form", () => {
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts--web/quick-tasks/204"),
    ).toBe("quick-tasks");
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts/web/quick-tasks/204?draft=1"),
    ).toBe("quick-tasks");
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts/settings/snapshots/status"),
    ).toBe("settings");
  });

  it("drops sections owned by a global rail entry", () => {
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts/web/sessions/42"),
    ).toBeNull();
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts--web/sessions"),
    ).toBeNull();
    expect(
      repoSectionFromPath("/evalucom/carepulse-ts/automations/7"),
    ).toBeNull();
  });

  it("has no section for repo roots or non-repo paths", () => {
    expect(repoSectionFromPath("/evalucom/carepulse-ts")).toBeNull();
    expect(repoSectionFromPath("/evalucom/carepulse-ts/web")).toBeNull();
    expect(repoSectionFromPath("/home")).toBeNull();
    expect(repoSectionFromPath("/settings/theme")).toBeNull();
  });

  it("repoSectionHref lands on the section, or the repo root without one", () => {
    expect(
      repoSectionHref("evalucom", "carepulse-ts", "apps/web", "quick-tasks"),
    ).toBe("/evalucom/carepulse-ts/web/quick-tasks");
    expect(
      repoSectionHref("evalucom", "carepulse-ts", undefined, "projects"),
    ).toBe("/evalucom/carepulse-ts/projects");
    expect(repoSectionHref("evalucom", "carepulse-ts", "apps/web", null)).toBe(
      "/evalucom/carepulse-ts/web",
    );
  });

  it("splits a comment anchor out of a notification href", () => {
    expect(
      hrefToNavigateOptions(
        "/evalucom/carepulse-ts/web/quick-tasks/204?comment=abc123",
      ),
    ).toEqual({
      to: "/evalucom/carepulse-ts--web/quick-tasks/204",
      search: { comment: "abc123" },
    });
  });

  it("leaves an href with no search untouched", () => {
    expect(hrefToNavigateOptions("/evalucom/carepulse-ts/quick-tasks/204"))
      .toEqual({
        to: "/evalucom/carepulse-ts/quick-tasks/204",
        search: {},
      });
  });

  it("repoPublicHref yields slash form for shareable links", () => {
    expect(repoPublicHref("evalucom", "carepulse-ts", "apps/web")).toBe(
      "/evalucom/carepulse-ts/web",
    );
    expect(repoPublicHref("evalucom", "carepulse-ts")).toBe(
      "/evalucom/carepulse-ts",
    );
  });
});
