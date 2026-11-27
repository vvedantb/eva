import { describe, expect, test } from "bun:test";
import {
  carryPreviewGrant,
  stripPreviewGrant,
  stripPreviewGrantFromPath,
} from "./previewGrant";

/**
 * The grant is a fresh bearer token on every getPreviewUrl call, so raw
 * preview URLs never compare equal. Two things depend on stripping it:
 * cached/shared links must not carry a token that goes stale or leaks access,
 * and the preview hook compares grant-stripped targets to decide whether the
 * iframe already shows the right app — a wrong answer reloads the running app
 * on every return to a cached session tab.
 */

const GRANT = "__eva_grant";

describe("stripPreviewGrant", () => {
  test("removes only the grant param", () => {
    expect(
      stripPreviewGrant(
        `https://sbx-1.vercel.run/dashboard?tab=logs&${GRANT}=abc123#top`,
      ),
    ).toBe("https://sbx-1.vercel.run/dashboard?tab=logs#top");
  });

  test("leaves a URL without a grant alone", () => {
    expect(
      stripPreviewGrant("https://sbx-1.vercel.run/dashboard?tab=logs"),
    ).toBe("https://sbx-1.vercel.run/dashboard?tab=logs");
  });

  test("two URLs differing only by grant strip to the same target", () => {
    const first = stripPreviewGrant(`https://sbx-1.vercel.run/?${GRANT}=one`);
    const second = stripPreviewGrant(`https://sbx-1.vercel.run/?${GRANT}=two`);

    expect(first).toBe(second);
  });

  test("a different sandbox host is still a different target", () => {
    expect(
      stripPreviewGrant(`https://sbx-1.vercel.run/?${GRANT}=one`),
    ).not.toBe(stripPreviewGrant(`https://sbx-2.vercel.run/?${GRANT}=one`));
  });

  test("returns non-URL input unchanged instead of throwing", () => {
    expect(stripPreviewGrant("not a url")).toBe("not a url");
  });
});

describe("stripPreviewGrantFromPath", () => {
  test("drops the grant and keeps the rest of the path", () => {
    expect(
      stripPreviewGrantFromPath(`/?tab=logs&${GRANT}=abc123#top`),
    ).toBe("/?tab=logs#top");
  });

  test("leaves a path without a grant alone", () => {
    expect(stripPreviewGrantFromPath("/dashboard?tab=logs")).toBe(
      "/dashboard?tab=logs",
    );
  });

  test("normalizes an empty or grant-only query to /", () => {
    expect(stripPreviewGrantFromPath(`/?${GRANT}=abc`)).toBe("/");
    expect(stripPreviewGrantFromPath("")).toBe("/");
  });

  test("adds a leading slash when missing", () => {
    expect(stripPreviewGrantFromPath(`home?${GRANT}=abc`)).toBe("/home");
  });
});

describe("carryPreviewGrant", () => {
  test("copies the grant onto a rebuilt path", () => {
    expect(
      carryPreviewGrant(
        `https://sbx-1.vercel.run/?${GRANT}=abc123`,
        "https://sbx-1.vercel.run/settings?tab=env",
      ),
    ).toBe(`https://sbx-1.vercel.run/settings?tab=env&${GRANT}=abc123`);
  });

  test("replaces a stale grant already on the target", () => {
    expect(
      carryPreviewGrant(
        `https://sbx-1.vercel.run/?${GRANT}=fresh`,
        `https://sbx-1.vercel.run/settings?${GRANT}=stale`,
      ),
    ).toBe(`https://sbx-1.vercel.run/settings?${GRANT}=fresh`);
  });

  test("leaves the target alone when the source has no grant", () => {
    expect(
      carryPreviewGrant(
        "https://sbx-1.vercel.run/",
        "https://sbx-1.vercel.run/settings",
      ),
    ).toBe("https://sbx-1.vercel.run/settings");
  });

  test("returns the target unchanged when either URL is unparseable", () => {
    expect(carryPreviewGrant("not a url", "https://sbx-1.vercel.run/")).toBe(
      "https://sbx-1.vercel.run/",
    );
    expect(
      carryPreviewGrant(`https://sbx-1.vercel.run/?${GRANT}=abc`, "not a url"),
    ).toBe("not a url");
  });

  test("carrying then stripping restores the plain target", () => {
    const target = "https://sbx-1.vercel.run/settings?tab=env";

    expect(
      stripPreviewGrant(
        carryPreviewGrant(`https://sbx-1.vercel.run/?${GRANT}=abc`, target),
      ),
    ).toBe(target);
  });
});
