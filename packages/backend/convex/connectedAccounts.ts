import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authAction, authMutation, authQuery } from "./functions";
import {
  connectorActorValidator,
  connectorProviderValidator,
} from "./validators";
import {
  CONNECTOR_ENV_KEYS,
  CONNECTOR_LABEL,
  CONNECTOR_PROVIDERS,
  authorizeUrl,
  isOAuthConfigured,
  oauthScopes,
  readOAuthClient,
  type ConnectorProvider,
} from "./_connectors/providers";

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_PATH_PREFIX = "/settings";

const statusValidator = v.object({
  provider: connectorProviderValidator,
  label: v.string(),
  oauthConfigured: v.boolean(),
  source: v.union(v.literal("oauth"), v.literal("env"), v.literal("none")),
  workspaceName: v.union(v.string(), v.null()),
  accountLabel: v.union(v.string(), v.null()),
  actor: v.union(connectorActorValidator, v.null()),
  shared: v.boolean(),
  envKey: v.union(v.string(), v.null()),
  envTeamName: v.union(v.string(), v.null()),
});

function safeReturnPath(path: string | undefined): string {
  if (!path || !path.startsWith(STATE_PATH_PREFIX) || path.includes("//")) {
    return "/settings/connections";
  }
  return path;
}

async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const verifier = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  let challengeBinary = "";
  for (const byte of new Uint8Array(digest)) {
    challengeBinary += String.fromCharCode(byte);
  }
  const challenge = btoa(challengeBinary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

async function envFallbackForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  provider: ConnectorProvider,
): Promise<{ key: string; teamName: string } | null> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const keys = CONNECTOR_ENV_KEYS[provider];
  for (const membership of memberships) {
    const doc = await ctx.db
      .query("teamEnvVars")
      .withIndex("by_team", (q) => q.eq("teamId", membership.teamId))
      .first();
    const hit = doc?.vars.find((entry) => keys.includes(entry.key));
    if (!hit) continue;
    const team = await ctx.db.get(membership.teamId);
    return { key: hit.key, teamName: team?.name ?? "Team" };
  }
  return null;
}

/**
 * Per-provider connection status for Settings → Connections. Never returns
 * token material — only whether OAuth or a team env key is available.
 */
export const listStatuses = authQuery({
  args: {},
  returns: v.array(statusValidator),
  handler: async (ctx) => {
    const statuses = [];
    for (const provider of CONNECTOR_PROVIDERS) {
      const row = await ctx.db
        .query("connectedAccounts")
        .withIndex("by_user_and_provider", (q) =>
          q.eq("userId", ctx.userId).eq("provider", provider),
        )
        .first();
      const env = await envFallbackForUser(ctx, ctx.userId, provider);
      const source = row ? ("oauth" as const) : env ? ("env" as const) : ("none" as const);
      statuses.push({
        provider,
        label: CONNECTOR_LABEL[provider],
        oauthConfigured: isOAuthConfigured(provider),
        source,
        workspaceName: row?.workspaceName ?? null,
        accountLabel: row?.accountLabel ?? null,
        actor: row?.actor ?? null,
        shared: row?.shared === true,
        envKey: env?.key ?? null,
        envTeamName: env?.teamName ?? null,
      });
    }
    return statuses;
  },
});

export const startOAuth = authMutation({
  args: {
    provider: connectorProviderValidator,
    actor: v.optional(connectorActorValidator),
    returnPath: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { clientId } = readOAuthClient(args.provider);
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set");
    const actor = args.actor ?? "user";
    const { verifier, challenge } = await createPkce();
    const nonce = crypto.randomUUID();
    await ctx.db.insert("connectorOauthStates", {
      nonce,
      userId: ctx.userId,
      provider: args.provider,
      actor,
      returnPath: safeReturnPath(args.returnPath),
      codeVerifier: verifier,
      expiresAt: Date.now() + STATE_TTL_MS,
    });
    const redirectUri = `${siteUrl.replace(/\/$/, "")}/api/connectors/oauth/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state: nonce,
      scope: oauthScopes(args.provider),
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    if (args.provider === "linear") {
      params.set("actor", actor);
    }
    return `${authorizeUrl(args.provider)}?${params.toString()}`;
  },
});

export const disconnect = authAction({
  args: { provider: connectorProviderValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runAction(internal._connectors.oauth.revokeAndDelete, {
      userId: ctx.userId,
      provider: args.provider,
    });
    return null;
  },
});

export const setShared = authMutation({
  args: {
    provider: connectorProviderValidator,
    shared: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectedAccounts")
      .withIndex("by_user_and_provider", (q) =>
        q.eq("userId", ctx.userId).eq("provider", args.provider),
      )
      .first();
    if (!row) throw new Error("Not connected");
    await ctx.db.patch(row._id, { shared: args.shared, updatedAt: Date.now() });
    return null;
  },
});
