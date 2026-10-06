import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import {
  connectorActorValidator,
  connectorProviderValidator,
} from "../validators";

const STATE_TTL_MS = 10 * 60 * 1000;

const storedTokenValidator = v.object({
  _id: v.id("connectedAccounts"),
  accessToken: v.string(),
  accessTokenExpiresAt: v.number(),
  refreshToken: v.union(v.string(), v.null()),
  refreshTokenExpiresAt: v.union(v.number(), v.null()),
  workspaceId: v.union(v.string(), v.null()),
  workspaceName: v.union(v.string(), v.null()),
  accountLabel: v.union(v.string(), v.null()),
  actor: connectorActorValidator,
  scopes: v.union(v.string(), v.null()),
});

export const getStoredToken = internalQuery({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
  },
  returns: v.union(storedTokenValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectedAccounts")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      accessToken: row.accessToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt,
      refreshToken: row.refreshToken ?? null,
      refreshTokenExpiresAt: row.refreshTokenExpiresAt ?? null,
      workspaceId: row.workspaceId ?? null,
      workspaceName: row.workspaceName ?? null,
      accountLabel: row.accountLabel ?? null,
      actor: row.actor,
      scopes: row.scopes ?? null,
    };
  },
});

export const putStoredToken = internalMutation({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
    actor: connectorActorValidator,
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshToken: v.union(v.string(), v.null()),
    refreshTokenExpiresAt: v.union(v.number(), v.null()),
    workspaceId: v.union(v.string(), v.null()),
    workspaceName: v.union(v.string(), v.null()),
    accountLabel: v.union(v.string(), v.null()),
    scopes: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("connectedAccounts")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .first();
    const fields = {
      actor: args.actor,
      accessToken: args.accessToken,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshToken: args.refreshToken ?? undefined,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt ?? undefined,
      workspaceId: args.workspaceId ?? undefined,
      workspaceName: args.workspaceName ?? undefined,
      accountLabel: args.accountLabel ?? undefined,
      scopes: args.scopes ?? undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return null;
    }
    await ctx.db.insert("connectedAccounts", {
      userId: args.userId,
      provider: args.provider,
      createdAt: now,
      ...fields,
    });
    return null;
  },
});

export const insertOauthState = internalMutation({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
    actor: connectorActorValidator,
    returnPath: v.optional(v.string()),
    codeVerifier: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const nonce = crypto.randomUUID();
    await ctx.db.insert("connectorOauthStates", {
      nonce,
      userId: args.userId,
      provider: args.provider,
      actor: args.actor,
      returnPath: args.returnPath,
      codeVerifier: args.codeVerifier,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    return nonce;
  },
});

export const consumeOauthState = internalMutation({
  args: { nonce: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      provider: connectorProviderValidator,
      actor: connectorActorValidator,
      returnPath: v.union(v.string(), v.null()),
      codeVerifier: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectorOauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return {
      userId: row.userId,
      provider: row.provider,
      actor: row.actor,
      returnPath: row.returnPath ?? null,
      codeVerifier: row.codeVerifier ?? null,
    };
  },
});

export const deleteStoredToken = internalMutation({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectedAccounts")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const purgeExpiredOauthStates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("connectorOauthStates")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(200);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
