import { describe, expect, it } from "vitest";
import {
  repoBasePaths,
  repoMatchesPath,
  repoSessionsIndexPath,
  sessionMatchesPath,
  type RepoPathParts,
} from "./repoSessionPaths";

function repo(
  owner: string,
  name: string,
  rootDirectory?: string,
): RepoPathParts {
  return { owner, name, ...(rootDirectory ? { rootDirectory } : {}) };
}

const eva = repo("vvedantb", "eva");
const web = repo("vvedantb", "eva", "apps/web");

describe("repoBasePaths", () => {
  it("is the single slash path for a root repo", () => {
    expect(repoBasePaths(eva)).toEqual(["/vvedantb/eva"]);
  });

  it("adds the router-internal `--` form for a monorepo app", () => {
    // location.pathname uses the `--` form; hrefs use the slash form. Matching
    // only one of them silently loses the active-row highlight.
    expect(repoBasePaths(web)).toEqual([
      "/vvedantb/eva/web",
      "/vvedantb/eva--web",
    ]);
  });
});

describe("repoSessionsIndexPath", () => {
  it("points at the app's sessions landing", () => {
    expect(repoSessionsIndexPath(eva)).toBe("/vvedantb/eva/sessions");
    expect(repoSessionsIndexPath(web)).toBe("/vvedantb/eva/web/sessions");
  });
});

describe("repoMatchesPath", () => {
  it("matches the repo root and any sub-page", () => {
    expect(repoMatchesPath(eva, "/vvedantb/eva")).toBe(true);
    expect(repoMatchesPath(eva, "/vvedantb/eva/sessions/12")).toBe(true);
  });

  it("does not match a repo whose name merely starts the same", () => {
    expect(repoMatchesPath(eva, "/vvedantb/eva-next/sessions")).toBe(false);
  });
});

/**
 * `useArchiveSession` redirects off the session route when the session you are
 * looking at is the one being archived. It used to ask
 * `pathname.includes("/sessions/" + id)`, which is true for far more than that
 * one session — so archiving a sibling from the sidebar threw you out of the
 * session you were reading. These cases pin the boundaries that check relies
 * on.
 */
describe("sessionMatchesPath", () => {
  it("matches the session's own route", () => {
    expect(sessionMatchesPath(eva, "12", "/vvedantb/eva/sessions/12")).toBe(
      true,
    );
  });

  it("matches a sub-route of the session, such as an open tab", () => {
    expect(
      sessionMatchesPath(eva, "12", "/vvedantb/eva/sessions/12/files"),
    ).toBe(true);
  });

  it("does not match a longer id that starts with the same digits", () => {
    // The regression: archiving session 12 navigated away from session 123.
    expect(sessionMatchesPath(eva, "12", "/vvedantb/eva/sessions/123")).toBe(
      false,
    );
    expect(
      sessionMatchesPath(eva, "12", "/vvedantb/eva/sessions/123/files"),
    ).toBe(false);
  });

  it("does not match the same id under a different app", () => {
    // Session numbers restart per app, so the repo has to be part of the test.
    expect(sessionMatchesPath(web, "12", "/vvedantb/eva/sessions/12")).toBe(
      false,
    );
    expect(
      sessionMatchesPath(eva, "12", "/vvedantb/other/sessions/12"),
    ).toBe(false);
  });

  it("matches a monorepo app on both the slash and `--` forms", () => {
    expect(
      sessionMatchesPath(web, "12", "/vvedantb/eva/web/sessions/12"),
    ).toBe(true);
    expect(
      sessionMatchesPath(web, "12", "/vvedantb/eva--web/sessions/12"),
    ).toBe(true);
  });

  it("matches nothing when the session has no path segment", () => {
    expect(sessionMatchesPath(eva, null, "/vvedantb/eva/sessions/12")).toBe(
      false,
    );
    expect(
      sessionMatchesPath(eva, undefined, "/vvedantb/eva/sessions/12"),
    ).toBe(false);
    expect(sessionMatchesPath(eva, "", "/vvedantb/eva/sessions/")).toBe(false);
  });
});
