import { describe, expect, test } from "bun:test";
import {
  isCodebaseLinked,
  pickableCodebaseRepos,
  toggleLinkedCodebase,
} from "./_utils";


type Row = { _id: string; owner: string; name: string; rootDirectory?: string };

const web: Row = {
  _id: "web",
  owner: "acme",
  name: "shop",
  rootDirectory: "apps/web",
};
const api: Row = {
  _id: "api",
  owner: "acme",
  name: "shop",
  rootDirectory: "apps/api",
};
/** The whole-checkout row for the same repo the two apps above live in. */
const shopRoot: Row = { _id: "shop", owner: "acme", name: "shop" };
const docs: Row = { _id: "docs", owner: "acme", name: "docs" };
const fork: Row = { _id: "fork", owner: "other", name: "shop" };

describe("isCodebaseLinked", () => {
  test("a sibling app of a linked repo counts as linked", () => {
    expect(isCodebaseLinked(web, [api])).toBe(true);
  });

  test("the same name under a different owner does not", () => {
    // Two different checkouts; only the sandbox directory would collide, and
    // codebaseNameCollides handles that separately.
    expect(isCodebaseLinked(fork, [web])).toBe(false);
  });

  test("nothing is linked when the selection is empty", () => {
    expect(isCodebaseLinked(web, [])).toBe(false);
  });
});

describe("toggleLinkedCodebase", () => {
  test("ticking appends the toggled row's own id", () => {
    expect(toggleLinkedCodebase(docs, [web])).toEqual(["web", "docs"]);
  });

  test("unticking a row linked through a sibling clears it", () => {
    // The group was saved holding `api`; the picker offers `web` for that
    // checkout. Filtering by `web._id` would leave `api` behind forever.
    expect(toggleLinkedCodebase(web, [api, docs])).toEqual(["docs"]);
  });

  test("unticking leaves every other checkout alone", () => {
    expect(toggleLinkedCodebase(docs, [web, docs, fork])).toEqual([
      "web",
      "fork",
    ]);
  });

  test("a tick followed by an untick returns to the starting selection", () => {
    const ticked = toggleLinkedCodebase(docs, [web]);
    expect(ticked).toEqual(["web", "docs"]);
    expect(toggleLinkedCodebase(docs, [web, docs])).toEqual(["web"]);
  });
});

describe("pickableCodebaseRepos", () => {
  test("offers one checkbox row per checkout, preferring the root app", () => {
    // Two checkboxes for one checkout would let the same repo be linked twice.
    const rows = pickableCodebaseRepos([web, api, shopRoot, docs], {
      owner: "acme",
      name: "other",
    });
    expect(rows.map((repo) => repo._id)).toEqual(["shop", "docs"]);
  });

  test("never offers the primary's own checkout", () => {
    // Linking it would clone the primary a second time over itself.
    const rows = pickableCodebaseRepos([web, api, docs], {
      owner: "acme",
      name: "shop",
    });
    expect(rows.map((repo) => repo._id)).toEqual(["docs"]);
  });
});
