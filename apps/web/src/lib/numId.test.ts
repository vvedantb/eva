import { describe, expect, it } from "bun:test";
import {
  parseRouteNumId,
  replaceRouteIdSegment,
  resolveEntity,
  routeNumIdFromPath,
} from "./numId";

describe("parseRouteNumId", () => {
  it("accepts positive integers and rejects Convex ids", () => {
    expect(parseRouteNumId("12")).toBe(12);
    expect(parseRouteNumId("0")).toBeNull();
    expect(parseRouteNumId("kd7abc123xyz456def789ghi012jkl")).toBeNull();
  });
});

describe("replaceRouteIdSegment", () => {
  const legacyId = "kd7abc123xyz456def789ghi012jkl";

  it("swaps the legacy id for the numId and keeps the rest of the path", () => {
    expect(
      replaceRouteIdSegment(`/acme/app/quick-tasks/${legacyId}`, legacyId, 7),
    ).toBe("/acme/app/quick-tasks/7");
  });

  it("keeps trailing route segments (tabs, sub-views)", () => {
    expect(
      replaceRouteIdSegment(
        `/acme/app/docs/${legacyId}/content`,
        legacyId,
        41,
      ),
    ).toBe("/acme/app/docs/41/content");
  });

  it("only touches its own segment so nested ids redirect independently", () => {
    const taskId = "kd9zzz999yyy888xxx777www666vvv";
    expect(
      replaceRouteIdSegment(
        `/acme/app/projects/${legacyId}/${taskId}/activity`,
        legacyId,
        3,
      ),
    ).toBe(`/acme/app/projects/3/${taskId}/activity`);
  });
});

describe("routeNumIdFromPath", () => {
  const base = "/acme/app/quick-tasks";

  it("reads the id segment and ignores anything below it", () => {
    expect(routeNumIdFromPath(`${base}/204`, base)).toBe("204");
    expect(routeNumIdFromPath(`${base}/204/sandbox`, base)).toBe("204");
  });

  it("has no id on the section root or a different section", () => {
    expect(routeNumIdFromPath(base, base)).toBeNull();
    expect(routeNumIdFromPath(`${base}/`, base)).toBeNull();
    expect(routeNumIdFromPath("/acme/app/projects/204", base)).toBeNull();
  });
});

describe("resolveEntity", () => {
  const doc = { _id: "kd7abc123xyz456def789ghi012jkl" };

  it("is ready once the document for a numId param arrives", () => {
    expect(resolveEntity("12", doc, { kind: "none" })).toEqual({
      status: "ready",
      doc,
      convexId: doc._id,
      numId: 12,
      redirectTo: null,
    });
  });

  it("stays loading while the numId query is in flight", () => {
    const result = resolveEntity("12", undefined, { kind: "none" });
    expect(result.status).toBe("loading");
    expect(result.numId).toBe(12);
  });

  it("is not-found once the numId query answers with nothing", () => {
    expect(resolveEntity("12", null, { kind: "none" }).status).toBe("not-found");
  });

  // Regression: links minted before the numId URLs (notification hrefs, "view
  // in Eva" links in PR bodies) carry a raw Convex id. While that id is being
  // looked up the route must NOT render "not found" — the flash was the whole
  // symptom, and the param is never a valid numId in this state.
  it("stays loading — never not-found — while a legacy id is looked up", () => {
    const result = resolveEntity(doc._id, undefined, { kind: "loading" });
    expect(result).toEqual({
      status: "loading",
      doc: null,
      convexId: null,
      numId: null,
      redirectTo: null,
    });
  });

  it("hands the route a redirect target and holds status at loading", () => {
    const result = resolveEntity(doc._id, undefined, {
      kind: "redirect",
      to: "/acme/app/quick-tasks/7",
    });
    // Status must not be `ready`, or the route paints the entity for a frame
    // before the redirect it is also being told to perform.
    expect(result.status).toBe("loading");
    expect(result.redirectTo).toBe("/acme/app/quick-tasks/7");
  });

  it("is not-found when the legacy id belongs to no document on this repo", () => {
    const result = resolveEntity(doc._id, undefined, { kind: "not-found" });
    expect(result.status).toBe("not-found");
    expect(result.redirectTo).toBeNull();
  });

  // The legacy lookup owns the outcome outright: a stale document left in the
  // cache from the previous route must not race it into `ready`.
  it("lets the legacy lookup win over a document already in cache", () => {
    expect(resolveEntity(doc._id, doc, { kind: "loading" }).status).toBe(
      "loading",
    );
    expect(resolveEntity(doc._id, doc, { kind: "not-found" }).doc).toBeNull();
  });

  it("is not-found for a param that is neither a numId nor a legacy lookup", () => {
    expect(resolveEntity("0", undefined, { kind: "none" }).status).toBe(
      "not-found",
    );
    expect(resolveEntity(undefined, undefined, { kind: "none" }).status).toBe(
      "not-found",
    );
  });
});
