import { httpAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  bytesToBase64Url,
  createHealthHandler,
  createMcpHttpHandler,
} from "@vvedantb/server";
import { z } from "zod";
import { isAllowedOAuthRedirectUri } from "../_mcp/redirectUri";
import { authenticateMcpToken, type McpPrincipal } from "./authenticate";

// Eva is its own MCP OAuth authorization server. Register, authorize and token
// live on this Convex site. Consent runs in the web app (WEB_APP_URL), because
// production Clerk keys are pinned to the primary web domain.

function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) throw new Error("WEB_APP_URL is not set in Convex env");
  return url.replace(/\/$/, "");
}

function textError(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Metadata (self-hosted, RFC 8414 / RFC 9728)
// ─────────────────────────────────────────────────────────────────────────────

export const oauthMetadata = httpAction(async (_ctx, request) => {
  const baseUrl = new URL(request.url).origin;
  return Response.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/mcp/oauth/token`,
    registration_endpoint: `${baseUrl}/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

export const protectedResourceMetadata = httpAction(async (_ctx, request) => {
  const baseUrl = new URL(request.url).origin;
  return Response.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Client Registration (RFC 7591)
// ─────────────────────────────────────────────────────────────────────────────

const registerBodySchema = z.object({
  redirect_uris: z
    .array(z.string())
    .min(1, "At least one redirect_uri is required"),
  client_name: z.string().optional(),
  client_uri: z.string().optional(),
  scope: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export const register = httpAction(async (ctx, request) => {
  let parsed;
  try {
    parsed = registerBodySchema.safeParse(await request.json());
  } catch {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Invalid JSON" },
      { status: 400 },
    );
  }
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description: parsed.error.issues[0]?.message ?? "Invalid body",
      },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (!body.redirect_uris.every(isAllowedOAuthRedirectUri)) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris contains an unsafe URI",
      },
      { status: 400 },
    );
  }

  const clientId = crypto.randomUUID();
  await ctx.runMutation(internal.mcp.oauth.registerClient, {
    clientId,
    redirectUris: body.redirect_uris,
  });

  return Response.json(
    {
      ...body,
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: body.response_types ?? ["code"],
      token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
    },
    { status: 201 },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Authorization: validate, then hand off to the web app consent page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `response_type` is optional (missing means `code`) and `scope` is ignored.
 * Some MCP clients omit both, so requiring them strands the flow here.
 * Unknown params are stripped: only the validated ones reach the SPA URL.
 */
export const authorizeQuerySchema = z.object({
  response_type: z.literal("code").optional(),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  state: z.string().min(1),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256"),
});

/** The params the SPA `/mcp/oauth/authorize` route reads. */
const FORWARDED_PARAMS = [
  "client_id",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
] as const;

/**
 * Redirect to the web app's `/mcp/oauth/authorize` route. That route handles
 * Clerk sign-in and consent, then mints a code via `mcp.oauth.authorize`.
 */
export const authorizeGet = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const parsed = authorizeQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return textError(
      `Invalid authorization request: ${issue?.path.join(".") ?? "query"}`,
    );
  }
  const params = parsed.data;

  const client = await ctx.runQuery(internal.mcp.oauth.getClient, {
    clientId: params.client_id,
    now: Date.now(),
  });
  if (!client) return textError("Unknown client_id");

  const target = new URL(`${getWebAppUrl()}/mcp/oauth/authorize`);
  for (const key of FORWARDED_PARAMS) {
    target.searchParams.set(key, params[key]);
  }
  return Response.redirect(target.toString(), 302);
});

// ─────────────────────────────────────────────────────────────────────────────
// Token Exchange
// ─────────────────────────────────────────────────────────────────────────────

const tokenBodySchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    redirect_uri: z.string(),
    code_verifier: z.string(),
    client_id: z.string(),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string(),
    client_id: z.string(),
  }),
]);

function oauthError(error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    { status: 400 },
  );
}

async function readTokenBody(request: Request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(await request.text());
      return tokenBodySchema.safeParse(Object.fromEntries(form));
    }
    return tokenBodySchema.safeParse(await request.json());
  } catch {
    return null;
  }
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)). */
async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export const token = httpAction(async (ctx, request) => {
  const parsed = await readTokenBody(request);
  if (!parsed?.success) {
    return oauthError("invalid_request", "Missing or invalid parameters");
  }
  const params = parsed.data;

  if (params.grant_type === "refresh_token") {
    const result = await ctx.runAction(internal.mcp.nodeActions.refreshToken, {
      refreshToken: params.refresh_token,
      clientId: params.client_id,
    });
    if (!result.success) {
      console.error("[MCP][token] refresh failed:", result.error);
      return oauthError("invalid_grant", result.error);
    }
    return Response.json(result.tokens);
  }

  const entry = await ctx.runMutation(internal.mcp.oauth.consumeAuthCode, {
    code: params.code,
  });
  if (!entry) {
    return oauthError("invalid_grant", "Invalid or expired authorization code");
  }
  if (entry.redirectUri !== params.redirect_uri) {
    return oauthError("invalid_grant", "Redirect URI mismatch");
  }
  if (entry.clientId !== params.client_id) {
    return oauthError("invalid_grant", "Client mismatch");
  }
  if (entry.codeChallengeMethod !== "S256") {
    return oauthError("invalid_grant", "Unsupported PKCE method");
  }
  if ((await pkceChallenge(params.code_verifier)) !== entry.codeChallenge) {
    return oauthError("invalid_grant", "PKCE verification failed");
  }

  const tokens = await ctx.runAction(internal.mcp.nodeActions.issueTokens, {
    clerkUserId: entry.clerkUserId,
    clientId: entry.clientId,
  });
  return Response.json(tokens);
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Endpoint + Health
// ─────────────────────────────────────────────────────────────────────────────

export const mcpHandler = httpAction(
  createMcpHttpHandler<McpPrincipal, ActionCtx>({
    authenticate: ({ ctx, token }) => authenticateMcpToken(ctx, token),
    handleRpc: ({ ctx, principal, body }) =>
      ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, {
        clerkUserId: principal.clerkUserId,
        scopedRepoId: principal.scopedRepoId,
        entityId: principal.entityId,
        entityKind: principal.entityKind,
        chatId: principal.chatId,
        body,
      }),
  }),
);

export const health = httpAction(createHealthHandler());
