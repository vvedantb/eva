import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { authMutation } from "../functions";
import { rejectSandboxCaller } from "../_auth/sandboxIdentity";

/** How long an authorize-hop nonce stays redeemable. */
const STATE_TTL_MS = 10 * 60 * 1000;

const storedTokenValidator = v.object({
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  refreshToken: v.union(v.string(), v.null()),
  refreshTokenExpiresAt: v.union(v.number(), v.null()),
});

/**
 * The caller's stored GitHub token row, ciphertext included.
 *
 * Internal-only: the values decrypt to a credential that can act as the user on
 * GitHub, so this must never be reachable from a client query.
 */
export const getStoredToken = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(storedTokenValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubUserTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      accessToken: row.accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshToken: row.refreshToken ?? null,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt ?? null,
    };
  },
});

/** Writes (or replaces) the caller's token row. Values must arrive encrypted. */
export const putStoredToken = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshToken: v.union(v.string(), v.null()),
    refreshTokenExpiresAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("githubUserTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const fields = {
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken ?? undefined,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt ?? undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return null;
    }
    await ctx.db.insert("githubUserTokens", {
      userId: args.userId,
      createdAt: now,
      ...fields,
    });
    return null;
  },
});

/**
 * Starts the GitHub authorize hop and returns the URL to send the browser to.
 *
 * The nonce is minted here rather than accepted from the client: the callback
 * trusts it alone to establish who came back, so a caller-chosen value would let
 * an attacker attach their own GitHub authorization to another Eva account.
 */
export const startUserAuthorization = authMutation({
  args: { installationId: v.union(v.number(), v.null()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new Error("GITHUB_CLIENT_ID is not set in Convex env");
    }
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) {
      throw new Error("CONVEX_SITE_URL is not set");
    }
    const nonce = crypto.randomUUID();
    await ctx.db.insert("githubOauthStates", {
      nonce,
      userId: ctx.userId,
      installationId: args.installationId ?? undefined,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${siteUrl}/api/github/oauth/callback`,
      state: nonce,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },
});

/**
 * Redeems a nonce, returning the user it was issued to.
 *
 * Deletes the row first so a replayed callback cannot mint a second token, and
 * returns null for anything expired or unknown.
 */
export const consumeOauthState = internalMutation({
  args: { nonce: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      installationId: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("githubOauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return {
      userId: row.userId,
      installationId: row.installationId ?? null,
    };
  },
});

/** Drops expired authorize-hop nonces. Scheduled from crons. */
export const purgeExpiredOauthStates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("githubOauthStates")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(200);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
