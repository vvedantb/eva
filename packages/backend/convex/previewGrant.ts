"use node";

import { createHmac } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { importJWK, jwtVerify, SignJWT, type JWK } from "jose";
import {
  PREVIEW_COMMENTS_AUDIENCE,
  PREVIEW_COMMENTS_TTL_SECONDS,
  PREVIEW_GRANT_AUDIENCE,
  PREVIEW_GRANT_ISSUER,
  PREVIEW_GRANT_PARAM,
  PREVIEW_GRANT_TTL_SECONDS,
} from "./previewGrantConfig";
import { assertActionSandboxAccess } from "./functions";
import { rejectSandboxCaller } from "./_auth/sandboxIdentity";
import { tryGetEvaBaseUrl } from "./_env/webAppUrl";
import { getSandboxHandle } from "./_sandbox_runtime/helpers";

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

/**
 * Signs the token a direct sandbox link uses for preview comments. It names
 * one user and one chat, is signed with the grant key (the sandbox holds only
 * the public half) and carries its own audience, so a grant cannot stand in.
 */
export async function signPreviewCommentsToken(params: {
  userId: string;
  chatId: string;
  sandboxId: string;
}): Promise<string> {
  const privateJwk = readPrivateJwk();
  const kid = typeof privateJwk.kid === "string" ? privateJwk.kid : "preview-1";
  const key = await importJWK(privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    chatId: params.chatId,
    sandboxId: params.sandboxId,
  })
    .setProtectedHeader({ alg: "ES256", kid })
    .setSubject(params.userId)
    .setIssuer(PREVIEW_GRANT_ISSUER)
    .setAudience(PREVIEW_COMMENTS_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + PREVIEW_COMMENTS_TTL_SECONDS)
    .sign(key);
}

/** The user and chat a valid preview comments token names, or null. */
export async function verifyPreviewCommentsToken(
  token: string,
): Promise<{ userId: string; chatId: string; sandboxId: string } | null> {
  try {
    const key = await importJWK(getPreviewGrantPublicJwk(), "ES256");
    const { payload } = await jwtVerify(token, key, {
      issuer: PREVIEW_GRANT_ISSUER,
      audience: PREVIEW_COMMENTS_AUDIENCE,
    });
    const { sub, chatId, sandboxId } = payload;
    if (
      typeof sub !== "string" ||
      typeof chatId !== "string" ||
      typeof sandboxId !== "string"
    ) {
      return null;
    }
    return { userId: sub, chatId, sandboxId };
  } catch {
    return null;
  }
}

/** Signs a short-lived ES256 preview grant bound to a specific sandbox + port. */
export async function signPreviewGrant(params: {
  sandboxId: string;
  port: number;
  sub: string;
  /** Preview comments token and the Convex site URL it works against. */
  comments?: { token: string; site: string; view: string };
}): Promise<string> {
  const privateJwk = readPrivateJwk();
  const kid = typeof privateJwk.kid === "string" ? privateJwk.kid : "preview-1";
  const key = await importJWK(privateJwk, "ES256");
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    sandboxId: params.sandboxId,
    port: params.port,
    ...(params.comments
      ? {
          ct: params.comments.token,
          site: params.comments.site,
          view: params.comments.view,
        }
      : {}),
  })
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
    /** Path, query and hash to open on the preview origin. */
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

    // `githubRepos.getByIdString` returns the repo only for the connector or a team
    // member, otherwise null — null means the user may not preview it.
    const repo = await ctx.runQuery(api.githubRepos.getByIdString, {
      repoId: args.repoId,
    });
    if (!repo) {
      throw new Error("Not authorized to access this repository");
    }
    await assertActionSandboxAccess(ctx, repo._id, args.sandboxId);

    const handle = await getSandboxHandle(ctx, repo._id, args.sandboxId);
    const preview = await handle.previewUrl(args.port);
    // A link to a sandbox that has a chat also carries a token for that
    // chat's preview comments. The proxy keeps it in a cookie the page reads
    // through the proxy, never in the URL.
    const site = process.env.CONVEX_SITE_URL;
    const commentsTarget = await ctx.runQuery(api.previewComments.linkTarget, {
      repoId: repo._id,
      sandboxId: args.sandboxId,
    });
    const webUrl = tryGetEvaBaseUrl();
    const comments =
      site && commentsTarget
        ? {
            site,
            // Where "View in chat" goes; empty when Eva's URL is unknown.
            view: webUrl && commentsTarget.webPath ? webUrl + commentsTarget.webPath : "",
            token: await signPreviewCommentsToken({
              userId: commentsTarget.userId,
              chatId: commentsTarget.chatId,
              sandboxId: args.sandboxId,
            }),
          }
        : undefined;
    const grant = await signPreviewGrant({
      sandboxId: args.sandboxId,
      port: args.port,
      sub: identity.subject,
      comments,
    });

    // Parse against a placeholder base, then copy only the path parts: the
    // caller's input can never change the origin, even as `//host/...`.
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
