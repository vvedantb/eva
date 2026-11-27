"use node";

import { createHmac } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { importJWK, SignJWT, type JWK } from "jose";
import {
  PREVIEW_GRANT_AUDIENCE,
  PREVIEW_GRANT_ISSUER,
  PREVIEW_GRANT_PARAM,
  PREVIEW_GRANT_TTL_SECONDS,
} from "./previewGrantConfig";
import { assertActionSandboxAccess } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { getSandboxHandle } from "./_sandbox_runtime/helpers";

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

/**
 * HMAC key (hex) for the proxy's session cookie on one sandbox port. Derived,
 * not random, so a proxy restart (sandbox resume, new script version) keeps
 * every open cookie valid and the visitor skips the sign-in handoff. It is a
 * one-way HMAC of the private key: knowing it does not reveal the grant key.
 */
export function previewSessionSecret(sandboxId: string, port: number): string {
  const d = readPrivateJwk().d;
  if (!d) throw new Error("PREVIEW_GRANT_PRIVATE_KEY has no private part");
  return createHmac("sha256", d)
    .update(`eva-preview-session:${sandboxId}:${port}`)
    .digest("hex");
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
 * access to the repo, and returns the URL to send the browser to. Called by
 * the `/preview-auth` handshake route when a cold/shared preview link is
 * opened.
 *
 * The grant is a bearer token for the whole sandbox, so the backend picks
 * where it goes: the sandbox's own preview origin for `port`, read from the
 * provider. Only the path, query and hash come from the caller, so a crafted
 * link cannot send the grant to another host.
 */
export const mintPreviewGrant = action({
  args: {
    sandboxId: v.string(),
    port: v.number(),
    repoId: v.string(),
    path: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    await rejectSandboxCaller(ctx);
    if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
      throw new Error(`Invalid preview port: ${args.port}`);
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const repo = await ctx.runQuery(api.githubRepos.getByIdString, {
      repoId: args.repoId,
    });
    if (!repo) {
      throw new Error("Not authorized to access this repository");
    }
    await assertActionSandboxAccess(ctx, repo._id, args.sandboxId);

    const handle = await getSandboxHandle(ctx, repo._id, args.sandboxId);
    const preview = await handle.previewUrl(args.port);
    const grant = await signPreviewGrant({
      sandboxId: args.sandboxId,
      port: args.port,
      sub: identity.subject,
    });

    const requested = new URL(args.path, "https://eva.invalid");
    const target = new URL(preview.url);
    target.protocol = "https:";
    target.pathname = requested.pathname;
    target.search = requested.search;
    target.hash = requested.hash;
    target.searchParams.set(PREVIEW_GRANT_PARAM, grant);
    return target.toString();
  },
});
