"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { decryptValue, encryptValue } from "../encryption";
import {
  connectorActorValidator,
  connectorProviderValidator,
} from "../validators";
import {
  CONNECTOR_LABEL,
  readOAuthClient,
  refreshUrl,
  revokeUrl,
  tokenUrl,
  type ConnectorProvider,
} from "./providers";

const EXPIRY_SKEW_MS = 60 * 1000;
const DEFAULT_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
}

interface Profile {
  workspaceId: string | null;
  workspaceName: string | null;
  accountLabel: string | null;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function parseExpiryMs(expiresIn: number | undefined): number {
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    return Date.now() + expiresIn * 1000;
  }
  return Date.now() + DEFAULT_ACCESS_TTL_MS;
}

function scopeString(scope: string | string[] | undefined): string | null {
  if (Array.isArray(scope)) return scope.join(" ");
  return scope ?? null;
}

async function postToken(
  url: string,
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: formBody(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${url} failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  return JSON.parse(text) as TokenResponse;
}

async function fetchProfile(
  provider: ConnectorProvider,
  accessToken: string,
): Promise<Profile> {
  if (provider === "linear") {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query:
          "{ viewer { id name email } organization { id name } }",
      }),
    });
    const json = (await response.json()) as {
      data?: {
        viewer?: { id?: string; name?: string; email?: string };
        organization?: { id?: string; name?: string };
      };
    };
    const org = json.data?.organization;
    const viewer = json.data?.viewer;
    return {
      workspaceId: org?.id ?? viewer?.id ?? null,
      workspaceName: org?.name ?? null,
      accountLabel: viewer?.email ?? viewer?.name ?? null,
    };
  }

  const response = await fetch("https://api.figma.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as {
    id?: string;
    email?: string;
    handle?: string;
  };
  return {
    workspaceId: json.id ?? null,
    workspaceName: null,
    accountLabel: json.email ?? json.handle ?? null,
  };
}

async function storeToken(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    provider: ConnectorProvider;
    actor: "user" | "app";
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string | null;
    refreshTokenExpiresAt: number | null;
    workspaceId: string | null;
    workspaceName: string | null;
    accountLabel: string | null;
    scopes: string | null;
  },
): Promise<void> {
  await ctx.runMutation(internal._connectors.tokens.putStoredToken, {
    userId: args.userId,
    provider: args.provider,
    actor: args.actor,
    accessToken: encryptValue(args.accessToken),
    accessTokenExpiresAt: args.accessTokenExpiresAt,
    refreshToken:
      args.refreshToken === null ? null : encryptValue(args.refreshToken),
    refreshTokenExpiresAt: args.refreshTokenExpiresAt,
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    accountLabel: args.accountLabel,
    scopes: args.scopes,
  });
}

export const completeAuthorization = internalAction({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
    actor: connectorActorValidator,
    code: v.string(),
    redirectUri: v.string(),
    codeVerifier: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { clientId, clientSecret } = readOAuthClient(args.provider);
    const body: Record<string, string> = {
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: clientId,
      grant_type: "authorization_code",
    };
    if (args.codeVerifier) body.code_verifier = args.codeVerifier;
    const token = await postToken(
      tokenUrl(args.provider),
      clientId,
      clientSecret,
      body,
    );
    if (!token.access_token) {
      throw new Error(`${CONNECTOR_LABEL[args.provider]} token response had no access_token`);
    }
    const profile = await fetchProfile(args.provider, token.access_token);
    await storeToken(ctx, {
      userId: args.userId,
      provider: args.provider,
      actor: args.actor,
      accessToken: token.access_token,
      accessTokenExpiresAt: parseExpiryMs(token.expires_in),
      refreshToken: token.refresh_token ?? null,
      refreshTokenExpiresAt: null,
      workspaceId: profile.workspaceId,
      workspaceName: profile.workspaceName,
      accountLabel: profile.accountLabel,
      scopes: scopeString(token.scope),
    });
    return null;
  },
});

export async function resolveUserAccessToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  provider: ConnectorProvider,
): Promise<string | null> {
  const stored = await ctx.runQuery(internal._connectors.tokens.getStoredToken, {
    userId,
    provider,
  });
  if (!stored) return null;

  const now = Date.now();
  if (stored.accessTokenExpiresAt - EXPIRY_SKEW_MS > now) {
    return decryptValue(stored.accessToken);
  }

  if (!stored.refreshToken) return null;

  const { clientId, clientSecret } = readOAuthClient(provider);
  const token = await postToken(refreshUrl(provider), clientId, clientSecret, {
    refresh_token: decryptValue(stored.refreshToken),
    grant_type: "refresh_token",
    client_id: clientId,
  });
  if (!token.access_token) return null;

  const nextRefresh = token.refresh_token
    ? token.refresh_token
    : decryptValue(stored.refreshToken);
  await storeToken(ctx, {
    userId,
    provider,
    actor: stored.actor,
    accessToken: token.access_token,
    accessTokenExpiresAt: parseExpiryMs(token.expires_in),
    refreshToken: nextRefresh,
    refreshTokenExpiresAt: stored.refreshTokenExpiresAt,
    workspaceId: stored.workspaceId,
    workspaceName: stored.workspaceName,
    accountLabel: stored.accountLabel,
    scopes: scopeString(token.scope) ?? stored.scopes,
  });
  return token.access_token;
}

export const revokeAndDelete = internalAction({
  args: {
    userId: v.id("users"),
    provider: connectorProviderValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await ctx.runQuery(
      internal._connectors.tokens.getStoredToken,
      { userId: args.userId, provider: args.provider },
    );
    if (!stored) return null;
    const endpoint = revokeUrl(args.provider);
    if (endpoint) {
      try {
        const { clientId, clientSecret } = readOAuthClient(args.provider);
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: basicAuth(clientId, clientSecret),
          },
          body: formBody({ token: decryptValue(stored.accessToken) }),
        });
      } catch {
        // Revoke is best-effort; still drop the local row.
      }
    }
    await ctx.runMutation(internal._connectors.tokens.deleteStoredToken, {
      userId: args.userId,
      provider: args.provider,
    });
    return null;
  },
});
