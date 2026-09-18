<<<<<<< HEAD
import { describe, expect, test } from "vitest";
=======
import { describe, expect, it } from "vitest";
>>>>>>> origin/main
import {
  repoBasePaths,
  repoMatchesPath,
  repoSessionsIndexPath,
<<<<<<< HEAD
  sessionHrefForRow,
  sessionRowMatchesPath,
} from "./repoSessionPaths";

const rootRepo = { owner: "acme", name: "eva" };
const appRepo = { owner: "acme", name: "eva", rootDirectory: "apps/web" };
const linkedFrom = { owner: "acme", name: "backend" };

describe("repoBasePaths", () => {
  test("root repo has one base", () => {
    expect(repoBasePaths(rootRepo)).toEqual(["/acme/eva"]);
  });

  test("monorepo app has slash and `--` bases", () => {
    expect(repoBasePaths(appRepo)).toEqual(["/acme/eva/web", "/acme/eva--web"]);
  });

  test("repoMatchesPath accepts either form", () => {
    expect(repoMatchesPath(appRepo, "/acme/eva--web/sessions")).toBe(true);
    expect(repoMatchesPath(appRepo, "/acme/eva/web/sessions")).toBe(true);
    expect(repoMatchesPath(appRepo, "/acme/other/sessions")).toBe(false);
  });

  test("sessions index is the slash form", () => {
    expect(repoSessionsIndexPath(appRepo)).toBe("/acme/eva/web/sessions");
  });
});

describe("sessionHrefForRow", () => {
  test("own row links under its app", () => {
    expect(sessionHrefForRow(rootRepo, { numId: 7 })).toBe(
      "/acme/eva/sessions/7",
    );
  });

  test("monorepo app row uses the router-internal `--` form", () => {
    expect(sessionHrefForRow(appRepo, { numId: 7 })).toBe(
      "/acme/eva--web/sessions/7",
    );
  });

  test("linked-in row links to the primary repo's session URL", () => {
    expect(sessionHrefForRow(rootRepo, { numId: 7, linkedFrom })).toBe(
      "/acme/backend/sessions/7",
    );
  });

  test("linked-in row honours the primary's monorepo app", () => {
    expect(
      sessionHrefForRow(rootRepo, {
        numId: 7,
        linkedFrom: { ...linkedFrom, rootDirectory: "services/api" },
      }),
    ).toBe("/acme/backend--api/sessions/7");
  });

  test("falls back to the sessions index without a numId", () => {
    expect(sessionHrefForRow(rootRepo, {})).toBe("/acme/eva/sessions");
  });
});

describe("sessionRowMatchesPath", () => {
  test("matches its own app in either URL form", () => {
    expect(
      sessionRowMatchesPath(appRepo, { numId: 7 }, "/acme/eva--web/sessions/7"),
    ).toBe(true);
    expect(
      sessionRowMatchesPath(appRepo, { numId: 7 }, "/acme/eva/web/sessions/7"),
    ).toBe(true);
  });

  test("matches sub-pages of the session", () => {
    expect(
      sessionRowMatchesPath(
        rootRepo,
        { numId: 7 },
        "/acme/eva/sessions/7/review/diffs",
      ),
    ).toBe(true);
  });

  test("a linked-in row is active on the primary repo's URL, not this app's", () => {
    expect(
      sessionRowMatchesPath(
        rootRepo,
        { numId: 7, linkedFrom },
        "/acme/backend/sessions/7",
      ),
    ).toBe(true);
    expect(
      sessionRowMatchesPath(
        rootRepo,
        { numId: 7, linkedFrom },
        "/acme/eva/sessions/7",
      ),
    ).toBe(false);
  });

  test("never matches without a numId", () => {
    expect(sessionRowMatchesPath(rootRepo, {}, "/acme/eva/sessions")).toBe(
      false,
    );
  });

  test("does not match a different session", () => {
    expect(
      sessionRowMatchesPath(rootRepo, { numId: 7 }, "/acme/eva/sessions/70"),
    ).toBe(false);
  });
=======
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
>>>>>>> origin/main
});
