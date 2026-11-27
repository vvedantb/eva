const SANDBOX_JWT_FALLBACK_ISSUER = "https://elegant-snail-639.convex.site";

export const SANDBOX_JWT_ISSUER =
  process.env.CONVEX_SITE_URL ?? SANDBOX_JWT_FALLBACK_ISSUER;

const jwksJson = process.env.SANDBOX_JWT_JWKS;
if (!jwksJson) {
  console.error(
    "Missing SANDBOX_JWT_JWKS env var — sandbox JWT auth is disabled on this deployment.",
  );
}

export const SANDBOX_JWT_JWKS_DATA_URI = jwksJson
  ? `data:application/json;base64,${btoa(jwksJson)}`
  : null;
