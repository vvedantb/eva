// The Convex env vars a sandbox's local backend gets when it is seeded from prod
// (`sync-to-local.mjs --sandbox-env`). Allowlist: a prod var that is not named
// here never reaches a sandbox. Every rule is one of:
//
//   { from: "source" }   copy the prod value; only when sharing it is harmless
//   { from: "sandbox" }  the sandbox's own env var of the same name (an Eva env
//                        var holding a test key); unset when Eva has none
//   { value: "..." }     a fixed, non-secret value
//   { generate: fn }     a fresh value for each seed (secrets, signing keys)
//
// A new prod env var: add it here, or the seed reports it as "not copied".

import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";

/** ES256 key pair for sandbox agent JWTs, in the shape `sandboxJwt.ts` reads. */
export async function createSandboxJwtKeys() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const pub = {
    ...(await exportJWK(publicKey)),
    kid: "sandbox-1",
    alg: "ES256",
    use: "sig",
  };
  const priv = {
    ...(await exportJWK(privateKey)),
    kid: "sandbox-1",
    alg: "ES256",
  };
  return {
    privateKey: JSON.stringify(priv),
    jwks: JSON.stringify({ keys: [pub] }),
  };
}

async function createPreviewGrantKey() {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  return JSON.stringify({
    ...(await exportJWK(privateKey)),
    kid: "preview-1",
    alg: "ES256",
  });
}

const randomSecret = async () => randomBytes(32).toString("hex");

// One pair per seed: the private key and its JWKS must match.
let sandboxJwtKeys;
const sandboxJwt = () => (sandboxJwtKeys ??= createSandboxJwtKeys());

const sandbox = { from: "sandbox" };

export const SANDBOX_ENV = {
  // Test key with its own spend limit, never the prod budget.
  AI_GATEWAY_API_KEY: sandbox,

  // Sandboxes sign in with the dev Clerk instance; must match the publishable
  // key the Eva startup command writes to apps/web/.env.local.
  CLERK_JWT_ISSUER_DOMAIN: {
    value: "https://powerful-hedgehog-79.clerk.accounts.dev",
  },
  CLERK_PUBLISHABLE_KEY: {
    value: "pk_test_cG93ZXJmdWwtaGVkZ2Vob2ctNzkuY2xlcmsuYWNjb3VudHMuZGV2JA",
  },
  CLERK_SECRET_KEY: sandbox,

  // Anything but "production" sends every email to SENDGRID_DEV_TEST_EMAIL.
  EMAIL_ENV: { value: "development" },
  SENDGRID_API_KEY: sandbox,
  SENDGRID_DEV_TEST_EMAIL: sandbox,
  SENDGRID_FROM_EMAIL: { from: "source" },

  ENVIRONMENT: { value: "development" },
  WEB_APP_URL: { value: "http://localhost:5173" },

  // A fresh key leaves prod's encrypted credentials unreadable in a sandbox.
  ENCRYPTION_KEY: { generate: randomSecret },
  EVA_DEPLOY_KEY: { generate: randomSecret },
  EXTENSION_ADMIN_KEY: { generate: randomSecret },
  MCP_INTERNAL_SECRET: { generate: randomSecret },
  MCP_JWT_SECRET: { generate: randomSecret },
  PREVIEW_GRANT_PRIVATE_KEY: { generate: createPreviewGrantKey },
  SANDBOX_JWT_PRIVATE_KEY: {
    generate: async () => (await sandboxJwt()).privateKey,
  },
  SANDBOX_JWT_JWKS: { generate: async () => (await sandboxJwt()).jwks },

  // A dev GitHub app, so sandboxes cannot touch prod repos or PRs.
  GITHUB_APP_ID: sandbox,
  GITHUB_APP_SLUG: sandbox,
  GITHUB_BOT_USER_ID: sandbox,
  GITHUB_CLIENT_ID: sandbox,
  GITHUB_CLIENT_SECRET: sandbox,
  GITHUB_PRIVATE_KEY: sandbox,
  GITHUB_WEBHOOK_SECRET: sandbox,
};

/**
 * Resolves every rule to a value. `readSource(name)` returns the prod value.
 * Returns the values to set and the sandbox vars Eva does not provide.
 */
export async function resolveSandboxEnv(readSource) {
  const values = new Map();
  const missing = [];
  for (const [name, rule] of Object.entries(SANDBOX_ENV)) {
    if ("value" in rule) {
      values.set(name, rule.value);
    } else if ("generate" in rule) {
      values.set(name, await rule.generate());
    } else if (rule.from === "source") {
      values.set(name, readSource(name));
    } else {
      const own = process.env[name];
      if (own) values.set(name, own);
      else missing.push(name);
    }
  }
  return { values, missing };
}
