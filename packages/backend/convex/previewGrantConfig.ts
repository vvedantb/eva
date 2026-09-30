// Shared constants for the preview-access "grant" handshake. Kept in a plain
// (non-"use node") module so both the Convex action that mints grants and the
// in-sandbox proxy builder can import them without pulling in Node-only deps.

/** Issuer claim on preview grants. Distinct from the sandbox-auth JWT issuer. */
export const PREVIEW_GRANT_ISSUER = "eva-preview";

/** Audience claim on preview grants, so a sandbox-auth JWT cannot be replayed here. */
export const PREVIEW_GRANT_AUDIENCE = "eva-preview";

/** Lifetime of the short-lived bootstrap grant carried in the URL (seconds). */
export const PREVIEW_GRANT_TTL_SECONDS = 5 * 60;

/** Lifetime of the proxy-issued session cookie that the grant is exchanged for. */
export const PREVIEW_SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Cookie name the in-sandbox proxy sets after validating a grant. */
export const PREVIEW_SESSION_COOKIE = "__eva_preview_session";

/** Query-string param carrying the bootstrap grant to the proxy. */
export const PREVIEW_GRANT_PARAM = "__eva_grant";

/**
 * Public hostname suffixes of sandbox preview origins: Vercel Sandbox and Boat.
 * Mirrored in apps/web/src/routes/preview-auth.tsx (open-redirect guard).
 */
export const SANDBOX_PREVIEW_HOST_SUFFIXES = [".vercel.run", ".on.boat.dev"];
