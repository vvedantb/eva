/** Parses a TanStack route param into a positive integer numId, or null if invalid. */
export function parseRouteNumId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export type EntityResolveStatus = "loading" | "not-found" | "ready";

/** Outcome of turning a numId (or legacy Convex id) route param into a document. */
export type EntityResolveResult<TDoc extends { _id: string }> = {
  status: EntityResolveStatus;
  doc: TDoc | null;
  convexId: TDoc["_id"] | null;
  numId: number | null;
  /**
   * Canonical path when the param holds a legacy Convex id. Status stays
   * `loading` while this is set — the owning route renders the redirect.
   */
  redirectTo: string | null;
};

/**
 * Swaps a legacy Convex id segment for its numId, keeping the rest of the path.
 * Route-shape agnostic, so nested ids (`/projects/:id/:taskId`) each redirect on
 * their own without either one needing to know the other's route.
 */
export function replaceRouteIdSegment(
  pathname: string,
  legacyId: string,
  numId: number,
): string {
  return pathname
    .split("/")
    .map((segment) => (segment === legacyId ? String(numId) : segment))
    .join("/");
}

/**
 * Outcome of the legacy Convex-id lookup that fronts every numId route.
 * `none` means the param is a normal numId and the lookup never ran.
 */
export type LegacyRedirect =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "redirect"; to: string };

/**
 * Turns a route param, its document and the legacy lookup into one resolve
 * result. Pure, and deliberately separate from the hooks that feed it: the
 * loading/not-found/redirect ordering is the part that breaks, and getting it
 * wrong flashes "not found" over a link that was about to redirect fine.
 */
export function resolveEntity<TDoc extends { _id: string }>(
  param: string | undefined,
  doc: TDoc | null | undefined,
  legacy: LegacyRedirect,
): EntityResolveResult<TDoc> {
  const parsedNumId = param !== undefined ? parseRouteNumId(param) : null;

  if (legacy.kind !== "none") {
    return {
      status: legacy.kind === "not-found" ? "not-found" : "loading",
      doc: null,
      convexId: null,
      numId: null,
      redirectTo: legacy.kind === "redirect" ? legacy.to : null,
    };
  }
  if (parsedNumId === null) {
    return {
      status: "not-found",
      doc: null,
      convexId: null,
      numId: null,
      redirectTo: null,
    };
  }
  if (doc === undefined) {
    return {
      status: "loading",
      doc: null,
      convexId: null,
      numId: parsedNumId,
      redirectTo: null,
    };
  }
  if (doc === null) {
    return {
      status: "not-found",
      doc: null,
      convexId: null,
      numId: parsedNumId,
      redirectTo: null,
    };
  }
  return {
    status: "ready",
    doc,
    convexId: doc._id,
    numId: parsedNumId,
    redirectTo: null,
  };
}

/** URL path segment for an entity with a per-repo numId. */
export function entityPathSegment(entity: { numId?: number }): string | null {
  if (entity.numId === undefined) {
    return null;
  }
  return String(entity.numId);
}

/** First path segment after `basePath` (the numId in entity detail URLs). */
export function routeNumIdFromPath(
  pathname: string,
  basePath: string,
): string | null {
  const prefix = `${basePath}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }
  const segment = pathname.slice(prefix.length).split("/")[0];
  return segment.length > 0 ? segment : null;
}
