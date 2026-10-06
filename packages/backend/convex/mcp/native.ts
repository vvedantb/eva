import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { z } from "zod";
import { isAllowedOAuthRedirectUri } from "../_mcp/redirectUri";

function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) throw new Error("WEB_APP_URL is not set in Convex env");
  return url.replace(/\/$/, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Metadata
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
// OAuth Client Registration
// ─────────────────────────────────────────────────────────────────────────────

export const register = httpAction(async (ctx, request) => {
  try {
    const body = z.record(z.unknown()).parse(await request.json());
    const clientId = crypto.randomUUID();

    const rawUris = body.redirect_uris;
    if (!Array.isArray(rawUris) || rawUris.length === 0) {
      throw new Error("At least one redirect_uri is required");
    }
    const redirectUris: string[] = [];
    for (const uri of rawUris) {
      if (typeof uri !== "string" || !isAllowedOAuthRedirectUri(uri)) {
        throw new Error("redirect_uris contains an unsafe URI");
      }
      redirectUris.push(uri);
    }

    await ctx.runMutation(internal.mcp.oauth.registerClient, {
      clientId,
      redirectUris,
    });

    return Response.json(
      {
        ...body,
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        grant_types: body.grant_types ?? ["authorization_code"],
        response_types: body.response_types ?? ["code"],
        token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return Response.json({ error: message }, { status: 400 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Authorization
// ─────────────────────────────────────────────────────────────────────────────

const authorizeQuerySchema = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.literal("S256"),
});

/**
 * Redirect to the web app's `/mcp/oauth/authorize` route, which handles Clerk
 * sign-in (production Clerk keys are pinned to the primary web domain) and
 * then mints an authorization code via the `mcp.oauth.authorize` mutation.
 */
export const authorizeGet = httpAction(async (ctx, request) => {
  try {
    const url = new URL(request.url);
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value;
    }

    const params = authorizeQuerySchema.parse(query);

    const client = await ctx.runQuery(internal.mcp.oauth.getClient, {
      clientId: params.client_id,
      now: Date.now(),
    });

    if (!client) {
      return new Response("<h1>Error</h1><p>Unknown client_id</p>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    const target = new URL(`${getWebAppUrl()}/mcp/oauth/authorize`);
    for (const [key, value] of Object.entries(params)) {
      target.searchParams.set(key, value);
    }

    return Response.redirect(target.toString(), 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Authorization failed";
    return new Response(`<h1>Error</h1><p>${message}</p>`, {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Token Exchange
// ─────────────────────────────────────────────────────────────────────────────

const authCodeBodySchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string(),
  redirect_uri: z.string(),
  code_verifier: z.string(),
  client_id: z.string(),
});

const refreshBodySchema = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string(),
  client_id: z.string(),
});

export const token = httpAction(async (ctx, request) => {
  const contentType = request.headers.get("Content-Type") ?? "";
  let body: unknown;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const formBody: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        formBody[key] = value;
      }
    });
    body = formBody;
  } else {
    try {
      body = await request.json();
    } catch (err) {
      console.error("[MCP][token] failed to parse JSON body:", err);
      return Response.json(
        { error: "invalid_request", error_description: "Invalid request body" },
        { status: 400 },
      );
    }
  }

  // Handle refresh token
  const refreshParse = refreshBodySchema.safeParse(body);
  if (refreshParse.success) {
    const result = await ctx.runAction(internal.mcp.nodeActions.refreshToken, {
      refreshToken: refreshParse.data.refresh_token,
      clientId: refreshParse.data.client_id,
    });
    if (!result.success) {
      console.error("[MCP][token] refresh failed:", result.error);
      return Response.json(
        { error: "invalid_grant", error_description: result.error },
        { status: 400 },
      );
    }
    return Response.json(result.tokens);
  }

  // Handle authorization code
  const parseResult = authCodeBodySchema.safeParse(body);
  if (!parseResult.success) {
    console.error(
      "[MCP][token] invalid request body. keys:",
      typeof body === "object" && body !== null ? Object.keys(body) : [],
      "issues:",
      parseResult.error.issues,
    );
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Missing or invalid parameters",
      },
      { status: 400 },
    );
  }
  const params = parseResult.data;

  const entry = await ctx.runMutation(internal.mcp.oauth.consumeAuthCode, {
    code: params.code,
  });

  if (!entry) {
    console.error("[MCP][token] auth code not found or expired");
    return Response.json(
      {
        error: "invalid_grant",
        error_description: "Invalid or expired authorization code",
      },
      { status: 400 },
    );
  }

  if (entry.redirectUri !== params.redirect_uri) {
    console.error(
      "[MCP][token] redirect_uri mismatch. stored:",
      entry.redirectUri,
      "given:",
      params.redirect_uri,
    );
    return Response.json(
      { error: "invalid_grant", error_description: "Redirect URI mismatch" },
      { status: 400 },
    );
  }

  if (entry.clientId !== params.client_id) {
    return Response.json(
      { error: "invalid_grant", error_description: "Client mismatch" },
      { status: 400 },
    );
  }
  if (entry.codeChallengeMethod !== "S256") {
    return Response.json(
      { error: "invalid_grant", error_description: "Unsupported PKCE method" },
      { status: 400 },
    );
  }

  // Verify PKCE using Web Crypto
  const encoder = new TextEncoder();
  const data = encoder.encode(params.code_verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const expectedChallenge = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  if (expectedChallenge !== entry.codeChallenge) {
    console.error(
      "[MCP][token] PKCE failed. expected:",
      expectedChallenge,
      "stored:",
      entry.codeChallenge,
    );
    return Response.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 },
    );
  }

  // Issue tokens (runs in Node.js)
  const tokens = await ctx.runAction(internal.mcp.nodeActions.issueTokens, {
    clerkUserId: entry.clerkUserId,
    clientId: entry.clientId,
  });

  return Response.json(tokens);
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Endpoint
// ─────────────────────────────────────────────────────────────────────────────

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0]?.toLowerCase() !== "bearer") return null;
  return parts[1] ?? null;
}

export const mcpHandler = httpAction(async (ctx, request) => {
  const baseUrl = new URL(request.url).origin;
  const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

  // Auth check
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        },
      },
    );
  }

  const credentials = await ctx.runAction(
    internal.mcp.nodeActions.verifyAccessToken,
    {
      token,
    },
  );

  if (!credentials) {
    console.error("[MCP][mcpHandler] token verification failed");
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
      },
    });
  }

  // Handle unsupported methods
  if (request.method === "GET" || request.method === "DELETE") {
    return Response.json(
      { error: "Method not supported in stateless mode" },
      { status: 405 },
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[MCP][mcpHandler] failed to parse JSON body:", err);
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Delegate to Node.js action for MCP protocol handling
  // The MCP SDK requires Node.js runtime
  const result = await ctx.runAction(
    internal.mcp.nodeActions.handleMcpRequest,
    {
      clerkUserId: credentials.clerkUserId,
      scopedRepoId: credentials.scopedRepoId,
      entityId: credentials.entityId,
      entityKind: credentials.entityKind,
      body: JSON.stringify(body),
    },
  );

  return new Response(result.body, {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

export const health = httpAction(async () => {
  return Response.json({ status: "ok" });
});
