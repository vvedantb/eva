import {
  SANDBOX_JWT_ISSUER,
  SANDBOX_JWT_JWKS_DATA_URI,
} from "./sandboxAuthConfig";

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!clerkDomain) {
  console.error(
    "Missing CLERK_JWT_ISSUER_DOMAIN env var — Clerk auth is disabled on this deployment.",
  );
}

export default {
  providers: [
    ...(clerkDomain
      ? [
          {
            domain: clerkDomain,
            applicationID: "convex",
          },
        ]
      : []),
    ...(SANDBOX_JWT_JWKS_DATA_URI
      ? [
          {
            type: "customJwt" as const,
            applicationID: "convex",
            issuer: SANDBOX_JWT_ISSUER,
            jwks: SANDBOX_JWT_JWKS_DATA_URI,
            algorithm: "ES256" as const,
          },
        ]
      : []),
  ],
};
