"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { importJWK, SignJWT, type JWK } from "jose";
import {
  PREVIEW_GRANT_AUDIENCE,
  PREVIEW_GRANT_ISSUER,
  PREVIEW_GRANT_TTL_SECONDS,
} from "./previewGrantConfig";
import { assertActionSandboxAccess } from "./functions";
import { isSandboxIdentity } from "./_auth/sandboxIdentity";

/**
 * Reads the ES256 preview-grant keypair from the env. The grant is asymmetric
 * on purpose: only the private half lives in Convex, while the public half is
 * embedded in the in-sandbox proxy. App code running inside a sandbox can read
 * the public key but cannot forge a grant with it.
 */
function readPrivateJwk(): JWK {
  const json = process.env.PREVIEW_GRANT_PRIVATE_KEY;
  if (!json) {
    throw new Error("Missing PREVIEW_GRANT_PRIVATE_KEY env var");
  }
  const jwk: JWK = JSON.parse(json);
  return jwk;
}

/**
 * Returns the public half of the preview-grant keypair (private `d` removed),
 * safe to embed in the sandbox proxy. Missing key material fails closed so a
 * deployment mistake cannot silently publish unauthenticated previews.
 */
export function getPreviewGrantPublicJwk(): JWK {
  const json = process.env.PREVIEW_GRANT_PRIVATE_KEY;
  if (!json) throw new Error("Missing PREVIEW_GRANT_PRIVATE_KEY env var");
  const jwk: JWK = JSON.parse(json);
  const publicJwk: JWK = { ...jwk };
  delete publicJwk.d;
  return publicJwk;
}

/** Signs a short-lived ES256 preview grant bound to a specific sandbox + port. */
export async function signPreviewGrant(params: {
  sandboxId: string;
  port: number;
  sub: string;
}): Promise<string> {
  const privateJwk = readPrivateJwk();
  const kid = typeof privateJwk.kid === "string" ? privateJwk.kid : "preview-1";
  const key = await importJWK(privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ sandboxId: params.sandboxId, port: params.port })
    .setProtectedHeader({ alg: "ES256", kid })
    .setSubject(params.sub)
    .setIssuer(PREVIEW_GRANT_ISSUER)
    .setAudience(PREVIEW_GRANT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + PREVIEW_GRANT_TTL_SECONDS)
    .sign(key);
}

/**
 * Mints a preview grant for the signed-in user, after confirming they have
 * access to the repo. Called by the `/preview-auth` handshake route when a
 * cold/shared preview link is opened.
 */
export const mintPreviewGrant = action({
  args: {
    sandboxId: v.string(),
    port: v.number(),
    repoId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }

    // `githubRepos.getByIdString` returns the repo only for the connector or a team
    // member, otherwise null — null means the user may not preview it.
    const repo = await ctx.runQuery(api.githubRepos.getByIdString, {
      repoId: args.repoId,
    });
    if (!repo) {
      throw new Error("Not authorized to access this repository");
    }
    await assertActionSandboxAccess(ctx, repo._id, args.sandboxId);

    return await signPreviewGrant({
      sandboxId: args.sandboxId,
      port: args.port,
      sub: identity.subject,
    });
  },
});
