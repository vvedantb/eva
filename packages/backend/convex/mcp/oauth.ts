import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
} from "../_generated/server";
import {
  isAllowedOAuthRedirectUri,
  redirectUriMatchesRegistered,
} from "../_mcp/redirectUri";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

const CODE_TTL_MS = 5 * 60 * 1000;
const CLIENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Authorize the current Clerk-authenticated user against an MCP OAuth client
 * and return a fresh authorization code.
 *
 * Called from the web app's `/mcp/oauth/authorize` route, which handles the
 * Clerk sign-in flow (production Clerk keys are pinned to the primary web
 * domain, so we cannot mount Clerk inside the Convex-hosted page).
 */
export const authorize = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const clerkUserId = identity.subject;

    const client = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      throw new Error("Unknown client_id");
    }
    if (Date.now() - client.registeredAt > CLIENT_TTL_MS) {
      throw new Error("Client registration expired");
    }
    if (args.codeChallengeMethod !== "S256") {
      throw new Error("Only S256 PKCE is supported");
    }
    if (!isAllowedOAuthRedirectUri(args.redirectUri)) {
      throw new Error("Unsafe redirect_uri");
    }
    if (!redirectUriMatchesRegistered(args.redirectUri, client.redirectUris)) {
      throw new Error("redirect_uri does not match registered URIs");
    }

    const codeBytes = new Uint8Array(32);
    crypto.getRandomValues(codeBytes);
    const code = Array.from(codeBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await ctx.db.insert("mcpAuthCodes", {
      code,
      clerkUserId,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      redirectUri: args.redirectUri,
      clientId: args.clientId,
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    return { code };
  },
});

/**
 * Store an OAuth authorization code.
 * Called after Clerk authentication to generate a code for the token exchange.
 */
export const storeAuthCode = internalMutation({
  args: {
    code: v.string(),
    clerkUserId: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    redirectUri: v.string(),
    clientId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("mcpAuthCodes", args);
  },
});

/**
 * Consume an authorization code (retrieve + delete atomically).
 * Returns the code entry if found and not expired, null otherwise.
 */
export const consumeAuthCode = internalMutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const entry = await ctx.db
      .query("mcpAuthCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!entry) return null;

    // Delete the code regardless of expiry (cleanup)
    await ctx.db.delete(entry._id);

    // Return null if expired
    if (entry.expiresAt < Date.now()) return null;

    return {
      clerkUserId: entry.clerkUserId,
      codeChallenge: entry.codeChallenge,
      codeChallengeMethod: entry.codeChallengeMethod,
      redirectUri: entry.redirectUri,
      clientId: entry.clientId,
    };
  },
});

/**
 * Register a new OAuth client.
 * Called during dynamic client registration.
 */
export const registerClient = internalMutation({
  args: {
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, { clientId, clientSecret, redirectUris }) => {
    await ctx.db.insert("mcpClientRegistrations", {
      clientId,
      clientSecret,
      redirectUris,
      registeredAt: Date.now(),
    });
  },
});

/**
 * Get an OAuth client by client_id.
 * Returns null if not found or expired (24h TTL).
 */
export const getClient = internalQuery({
  // `now` is passed in by the caller: computing Date.now() inside a query makes
  // the TTL check nondeterministic — Convex caches query results by data
  // dependencies, so an expired registration could keep being served.
  args: { clientId: v.string(), now: v.number() },
  handler: async (ctx, { clientId, now }) => {
    const client = await ctx.db
      .query("mcpClientRegistrations")
      .withIndex("by_clientId", (q) => q.eq("clientId", clientId))
      .first();

    if (!client) return null;

    // 24h TTL for client registrations
    if (now - client.registeredAt > CLIENT_TTL_MS) {
      return null;
    }

    return {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUris: client.redirectUris,
      registeredAt: client.registeredAt,
    };
  },
});

/**
 * Cleanup expired auth codes and client registrations.
 * Can be called periodically via cron or manually.
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Cleanup expired auth codes
    const expiredCodes = await ctx.db
      .query("mcpAuthCodes")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const code of expiredCodes) {
      await ctx.db.delete(code._id);
    }

    // Cleanup expired client registrations
    const expiredClients = await ctx.db
      .query("mcpClientRegistrations")
      .filter((q) => q.lt(q.field("registeredAt"), now - CLIENT_TTL_MS))
      .collect();

    for (const client of expiredClients) {
      await ctx.db.delete(client._id);
    }

    return {
      deletedCodes: expiredCodes.length,
      deletedClients: expiredClients.length,
    };
  },
});
