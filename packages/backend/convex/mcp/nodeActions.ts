"use node";

import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";
import { createClerkClient } from "@clerk/backend";
import { jwtVerify, SignJWT, importJWK } from "jose";
import { z } from "zod";
import { internal } from "../_generated/api";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildTools } from "./tools";
import { supabaseTools } from "./supabase";
import { mountFlat, type EvaTool } from "./registry";
import { codeModeTools } from "../_mcp/codeModeTools";
import { jsonValue, type JsonValue } from "../_jev/jsonValue";
import {
  awaitSandboxActive,
  buildChatMessageCalls,
  resolveAgentDelivery,
  SANDBOX_STOP_SETTLE_TIMEOUT_MS,
  SANDBOX_SURFACES,
  TASK_PREVIEW_SANDBOX_READY_POLL_MS,
  type AgentDelivery,
  type ChatTargetKind,
} from "./orchestratorDelivery";
import {
  PROJECT_CHAT_STREAM_PREFIX,
  TASK_CHAT_STREAM_PREFIX,
} from "../_chat/surfaceAdapters";
import { prStateValidator } from "../validators";
import { mcpPullRequestValidator, type McpLinkedRepo } from "./queries";
import { formatConvexQueryError } from "./convexQueryLimits";
import { resolvePublicConvexCloudUrl } from "../_env/publicConvexUrls";
import { chatSourceArg } from "./toolShared";

// ─────────────────────────────────────────────────────────────────────────────
// Environment Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret) throw new Error("MCP_JWT_SECRET is required");
  return secret;
}

function getClerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is required");
  return key;
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT Claim Schemas (boundary parsing for verified payloads)
// ─────────────────────────────────────────────────────────────────────────────

const refreshTokenClaims = z.object({
  sub: z.string(),
  type: z.literal("refresh"),
  clientId: z.string(),
  iss: z.literal("eva"),
  aud: z.literal("mcp-oauth"),
});

const oauthTokenClaims = z.object({
  sub: z.string(),
  clientId: z.string(),
  iss: z.literal("eva"),
  aud: z.literal("mcp-oauth"),
});

const internalTokenClaims = z.object({
  sub: z.string(),
  iss: z.literal("eva"),
  aud: z.literal("mcp-internal"),
  repoId: z.string(),
  entityId: z.string().optional(),
  entityKind: z.enum(["session", "task", "project"]).optional(),
});

type OauthTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  refresh_token: string;
};

type RefreshResult =
  | { success: true; tokens: OauthTokens }
  | { success: false; error: string };

function refreshFailure(error: string): RefreshResult {
  return { success: false, error };
}

function refreshSuccess(tokens: OauthTokens): RefreshResult {
  return { success: true, tokens };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Actions
// ─────────────────────────────────────────────────────────────────────────────

async function createOauthTokens(
  clerkUserId: string,
  clientId: string,
  secret: Uint8Array,
): Promise<OauthTokens> {
  const accessToken = await new SignJWT({ sub: clerkUserId, clientId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("eva")
    .setAudience("mcp-oauth")
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(secret);

  const refreshToken = await new SignJWT({
    sub: clerkUserId,
    clientId,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("eva")
    .setAudience("mcp-oauth")
    .setExpirationTime("30d")
    .setIssuedAt()
    .sign(secret);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: "claudeai",
    refresh_token: refreshToken,
  };
}

export const issueTokens = internalAction({
  args: { clerkUserId: v.string(), clientId: v.string() },
  returns: v.object({
    access_token: v.string(),
    token_type: v.literal("Bearer"),
    expires_in: v.number(),
    scope: v.string(),
    refresh_token: v.string(),
  }),
  handler: async (_ctx, { clerkUserId, clientId }) => {
    const secret = new TextEncoder().encode(getJwtSecret());
    return await createOauthTokens(clerkUserId, clientId, secret);
  },
});

export const refreshToken = internalAction({
  args: { refreshToken: v.string(), clientId: v.string() },
  returns: v.union(
    v.object({
      success: v.literal(true),
      tokens: v.object({
        access_token: v.string(),
        token_type: v.literal("Bearer"),
        expires_in: v.number(),
        scope: v.string(),
        refresh_token: v.string(),
      }),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    }),
  ),
  handler: async (_ctx, { refreshToken, clientId }) => {
    try {
      const secret = new TextEncoder().encode(getJwtSecret());
      const { payload } = await jwtVerify(refreshToken, secret, {
        issuer: "eva",
        audience: "mcp-oauth",
      });

      const claims = refreshTokenClaims.safeParse(payload);
      if (!claims.success || claims.data.clientId !== clientId) {
        return refreshFailure("Invalid refresh token");
      }

      const clerk = createClerkClient({ secretKey: getClerkSecretKey() });
      await clerk.users.getUser(claims.data.sub);
      const tokens = await createOauthTokens(claims.data.sub, clientId, secret);

      return refreshSuccess(tokens);
    } catch {
      return refreshFailure("Expired or invalid refresh token");
    }
  },
});

export const verifyAccessToken = internalAction({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      clerkUserId: v.string(),
      scopedRepoId: v.optional(v.string()),
      entityId: v.optional(v.string()),
      entityKind: v.optional(
        v.union(v.literal("session"), v.literal("task"), v.literal("project")),
      ),
    }),
    v.null(),
  ),
  handler: async (_ctx, { token }) => {
    // Try OAuth token first
    try {
      const secret = new TextEncoder().encode(getJwtSecret());
      const { payload } = await jwtVerify(token, secret, {
        issuer: "eva",
        audience: "mcp-oauth",
      });

      const claims = oauthTokenClaims.safeParse(payload);
      if (claims.success) {
        // Best-effort Clerk lookup — agent/test users may not exist in Clerk but
        // a verified JWT sub is still authoritative for MCP auth.
        try {
          const clerk = createClerkClient({ secretKey: getClerkSecretKey() });
          await clerk.users.getUser(claims.data.sub);
        } catch (err) {
          console.error(
            "[MCP][verifyAccessToken] Clerk getUser failed (using JWT sub):",
            err instanceof Error ? err.message : err,
          );
          return null;
        }
        // Same shape as internal tokens so callers can read optional fields
        // without narrowing (OAuth tokens just leave them unset).
        return {
          clerkUserId: claims.data.sub,
          scopedRepoId: undefined,
          entityId: undefined,
          entityKind: undefined,
        };
      }
      // OAuth payload missing sub — fall through to internal token
    } catch {
      // Not an OAuth token — fall through to internal token
    }

    // Try internal token (scoped repo access)
    try {
      const internalSecret = process.env.MCP_INTERNAL_SECRET;
      if (!internalSecret) {
        console.error("[MCP][verifyAccessToken] MCP_INTERNAL_SECRET not set");
        return null;
      }

      const secret = new TextEncoder().encode(internalSecret);
      const { payload } = await jwtVerify(token, secret);

      // Validate internal token structure
      const claims = internalTokenClaims.safeParse(payload);
      if (!claims.success) {
        console.error(
          "[MCP][verifyAccessToken] internal token payload invalid",
        );
        return null;
      }

      return {
        clerkUserId: claims.data.sub,
        scopedRepoId: claims.data.repoId,
        ...(claims.data.entityId !== undefined
          ? { entityId: claims.data.entityId }
          : {}),
        ...(claims.data.entityKind !== undefined
          ? { entityKind: claims.data.entityKind }
          : {}),
      };
    } catch (err) {
      console.error(
        "[MCP][verifyAccessToken] all verification failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Convex API Helpers (for calling target Convex deployments)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

const convexSuccessResponse = z.object({
  status: z.literal("success"),
  value: jsonValue,
  logLines: z.array(z.string()).optional(),
});

const convexErrorResponse = z.object({
  status: z.literal("error"),
  errorMessage: z.string(),
});

const convexResponse = z.union([convexSuccessResponse, convexErrorResponse]);

function authHeaders(deployKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Convex ${deployKey}`,
  };
}

function parseConvexResponse(json: JsonValue) {
  const result = convexResponse.parse(json);
  if (result.status === "error") {
    throw new Error(result.errorMessage);
  }
  return result;
}

function wrapQueryHandler(handlerBody: string): string {
  return [
    'import { query } from "convex:/_system/repl/wrappers.js";',
    "",
    "export default query({",
    "  handler: async (ctx) => {",
    `    ${handlerBody}`,
    "  },",
    "});",
  ].join("\n");
}

// In-memory caches (reset on action cold starts)
let cachedDeployKey: { value: string; expiresAt: number } | null = null;
const userIdCache = new Map<string, { userId: string; expiresAt: number }>();
const repoCredentialsCache = new Map<
  string,
  { convexUrl: string; deployKey: string; expiresAt: number }
>();
const userJwtCache = new Map<string, { jwt: string; expiresAt: number }>();

function getConvexSiteUrl(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) throw new Error("CONVEX_SITE_URL is required");
  return url;
}

function getBootstrapSecret(): string {
  const secret = process.env.MCP_BOOTSTRAP_SECRET;
  if (!secret) throw new Error("MCP_BOOTSTRAP_SECRET is required");
  return secret;
}

/**
 * Eva's own Convex API URL, used for the `runAsUser` calls below.
 *
 * Prefer `CONVEX_CLOUD_URL`, which every deployment sets and which is correct
 * by construction. The `.convex.site` → `.convex.cloud` rewrite only works on
 * hosted URLs: on a local or self-hosted backend the site URL is a plain
 * `host:site-proxy-port` with no substring to replace, so the rewrite silently
 * returned the site-proxy URL and every call 404'd ("No matching routes
 * found") — the whole MCP tool layer was unusable against such deployments.
 */
function getEvaConvexCloudUrl(): string {
  const configured = resolvePublicConvexCloudUrl(process.env);
  if (configured) return configured;
  return getConvexSiteUrl().replace(".convex.site", ".convex.cloud");
}

/** Deployed web app origin, used to build hosted artifact view links. */
function getWebAppUrl(): string {
  const url = process.env.WEB_APP_URL;
  if (!url) throw new Error("WEB_APP_URL is required");
  return url.replace(/\/$/, "");
}

async function getDeployKey(): Promise<string> {
  if (cachedDeployKey && cachedDeployKey.expiresAt > Date.now()) {
    return cachedDeployKey.value;
  }
  const response = await fetch(`${getConvexSiteUrl()}/api/mcp/bootstrap`, {
    headers: { Authorization: `MCPBootstrap ${getBootstrapSecret()}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to bootstrap deploy key: HTTP ${response.status}`);
  }
  const body = z.object({ deployKey: z.string() }).parse(await response.json());
  cachedDeployKey = {
    value: body.deployKey,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return body.deployKey;
}

async function runTestQueryRemote(
  convexUrl: string,
  deployKey: string,
  source: string,
): Promise<{ value: JsonValue; logLines: string[] }> {
  const result = await postConvex(
    `${convexUrl}/api/run_test_function`,
    { "Content-Type": "application/json" },
    {
      adminKey: deployKey,
      args: {},
      bundle: { path: "testQuery.js", source },
      format: "convex_encoded_json",
    },
  );
  return { value: result.value, logLines: result.logLines ?? [] };
}

async function resolveUserByClerkId(
  deployKey: string,
  clerkUserId: string,
): Promise<string | null> {
  const cached = userIdCache.get(clerkUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  const convexUrl = getEvaConvexCloudUrl();
  const source = wrapQueryHandler(
    `const user = await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", ${JSON.stringify(clerkUserId)})).first();
    return user ? user._id : null;`,
  );
  const result = await runTestQueryRemote(convexUrl, deployKey, source);
  if (typeof result.value === "string") {
    userIdCache.set(clerkUserId, {
      userId: result.value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result.value;
  }
  return null;
}

async function signUserJwt(clerkUserId: string): Promise<string> {
  const cached = userJwtCache.get(clerkUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.jwt;
  }

  const privateKeyJson = process.env.SANDBOX_JWT_PRIVATE_KEY;
  if (!privateKeyJson) throw new Error("Missing SANDBOX_JWT_PRIVATE_KEY");

  const issuer = getConvexSiteUrl();
  const privateKeyJwk: Record<string, string> = JSON.parse(privateKeyJson);
  const kid = privateKeyJwk.kid ?? "sandbox-1";
  const key = await importJWK(privateKeyJwk, "ES256");

  const jwt = await new SignJWT({ sub: clerkUserId })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuer(issuer)
    .setAudience("convex")
    .setExpirationTime("1h")
    .setIssuedAt()
    .sign(key);

  userJwtCache.set(clerkUserId, {
    jwt,
    expiresAt: Date.now() + 55 * 60 * 1000,
  });

  return jwt;
}

/**
 * POSTs one request to a Convex HTTP API endpoint and parses the reply. Throws
 * on a non-2xx status or a Convex error result.
 */
async function postConvex(
  url: string,
  headers: Record<string, string>,
  body: Record<string, JsonValue>,
) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return parseConvexResponse(jsonValue.parse(await response.json()));
}

type AsUserType = "query" | "mutation" | "action";

/**
 * Calls one public Eva function as the given user. Signs the user JWT, so the
 * function's auth wrapper and access checks (hasRepoAccess/hasTeamAccess)
 * apply automatically.
 */
async function runAsUser(
  type: AsUserType,
  clerkUserId: string,
  path: string,
  args: Record<string, JsonValue>,
): Promise<JsonValue> {
  const jwt = await signUserJwt(clerkUserId);
  const result = await postConvex(
    `${getEvaConvexCloudUrl()}/api/${type}`,
    { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    { path, args, format: "json" },
  );
  return result.value;
}

/**
 * Runs one public Eva function as the MCP caller, so the tool inherits the
 * exact access checks (authQuery/authMutation, hasRepoAccess) the web UI hits.
 * The one generic bridge MCP tools use to reach UI-backed functions; `path` is
 * the Convex function path, e.g. "automations:runNow".
 */
export const callAsUser = internalAction({
  args: {
    clerkUserId: v.string(),
    type: v.union(
      v.literal("query"),
      v.literal("mutation"),
      v.literal("action"),
    ),
    path: v.string(),
    argsJson: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, { clerkUserId, type, path, argsJson }) => {
    const args = z.record(z.string(), jsonValue).parse(JSON.parse(argsJson));
    const value = await runAsUser(type, clerkUserId, path, args);
    return JSON.stringify(value ?? null);
  },
});

async function ensureUserExists(clerkUserId: string): Promise<string> {
  const result = await runAsUser(
    "mutation",
    clerkUserId,
    "auth:ensureUserExists",
    {},
  );
  const parsed = z
    .object({ userId: z.string(), wasCreated: z.boolean() })
    .parse(result);
  return parsed.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Actions for MCP Tools
// ─────────────────────────────────────────────────────────────────────────────

export const getContext = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.object({ deployKey: v.string(), userId: v.string() }),
  handler: async (_ctx, { clerkUserId }) => {
    const deployKey = await getDeployKey();
    let userId = await resolveUserByClerkId(deployKey, clerkUserId);
    if (!userId) userId = await ensureUserExists(clerkUserId);
    return { deployKey, userId };
  },
});

const repoSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  rootDirectory: z.string().nullable(),
  mcpRootPrompt: z.string().nullable(),
});

export const listUserRepos = internalAction({
  args: { userId: v.string() },
  returns: v.array(
    v.object({
      id: v.string(),
      owner: v.string(),
      name: v.string(),
      rootDirectory: v.union(v.string(), v.null()),
      mcpRootPrompt: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (_ctx, { userId }) => {
    const deployKey = await getDeployKey();
    const convexUrl = getEvaConvexCloudUrl();

    const source = wrapQueryHandler(
      `const userId = ${JSON.stringify(userId)};
      const toEntry = (r) => ({ id: r._id, owner: r.owner, name: r.name, rootDirectory: r.rootDirectory ?? null, mcpRootPrompt: r.mcpRootPrompt ?? null });
      const memberships = await ctx.db.query("teamMembers").withIndex("by_user", q => q.eq("userId", userId)).collect();
      const teamRepoResults = await Promise.all(memberships.map(m => ctx.db.query("githubRepos").withIndex("by_team", q => q.eq("teamId", m.teamId)).collect()));
      const connectedRepos = await ctx.db.query("githubRepos").withIndex("by_connected_by", q => q.eq("connectedBy", userId)).collect();
      const seen = new Set();
      const result = [];
      for (const repo of [...connectedRepos, ...teamRepoResults.flat()]) {
        if (seen.has(String(repo._id))) continue;
        seen.add(String(repo._id));
        result.push(toEntry(repo));
      }
      return result;`,
    );
    const result = await runTestQueryRemote(convexUrl, deployKey, source);
    return z.array(repoSchema).parse(result.value);
  },
});

interface EnvVar {
  key: string;
  value: string;
}

/**
 * Lookup keys for Convex credentials, per environment.
 *
 * Staging keys are the canonical/legacy keys (also consumed by the sandbox and
 * the deployed app). Prod keys are MCP-only and should be stored with
 * `sandboxExclude: true` so they never reach the sandbox.
 */
const CONVEX_CRED_KEYS = {
  staging: {
    url: ["NEXT_PUBLIC_CONVEX_URL", "VITE_CONVEX_URL", "CONVEX_URL"],
    deployKey: ["CONVEX_DEPLOY_KEY", "CONVEX_ADMIN_KEY"],
  },
  prod: {
    url: ["PROD_CONVEX_URL"],
    deployKey: ["PROD_CONVEX_DEPLOY_KEY", "PROD_CONVEX_ADMIN_KEY"],
  },
} as const;

export const getRepoConvexCredentials = internalAction({
  args: {
    repoId: v.string(),
    userId: v.string(),
    environment: v.optional(v.union(v.literal("staging"), v.literal("prod"))),
  },
  returns: v.union(
    v.object({ convexUrl: v.string(), deployKey: v.string() }),
    v.null(),
  ),
  handler: async (
    ctx,
    { repoId, userId, environment },
  ): Promise<{ convexUrl: string; deployKey: string } | null> => {
    const env = environment ?? "prod";
    const cacheKey = `${userId}:${repoId}:${env}`;
    const cached = repoCredentialsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { convexUrl: cached.convexUrl, deployKey: cached.deployKey };
    }

    const vars: EnvVar[] = await ctx.runAction(
      internal.mcp.routes.getDecryptedRepoEnvVars,
      { repoId },
    );

    const lookup = CONVEX_CRED_KEYS[env];
    const urlEntry: EnvVar | undefined = lookup.url
      .map((k) => vars.find((entry) => entry.key === k))
      .find((entry): entry is EnvVar => entry !== undefined);
    const keyEntry: EnvVar | undefined = lookup.deployKey
      .map((k) => vars.find((entry) => entry.key === k))
      .find((entry): entry is EnvVar => entry !== undefined);

    if (!urlEntry || !keyEntry) return null;

    const creds: { convexUrl: string; deployKey: string; expiresAt: number } = {
      convexUrl: urlEntry.value.replace(/\/$/, ""),
      deployKey: keyEntry.value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    repoCredentialsCache.set(cacheKey, creds);
    return { convexUrl: creds.convexUrl, deployKey: creds.deployKey };
  },
});

const schemaTableSchema = z.object({
  tableName: z.string(),
  indexes: jsonValue,
  searchIndexes: jsonValue,
  vectorIndexes: jsonValue,
  documentType: jsonValue,
});

export const listTables = internalAction({
  args: { convexUrl: v.string(), deployKey: v.string() },
  returns: v.array(v.any()),
  handler: async (_ctx, { convexUrl, deployKey }) => {
    // Fetch shapes
    const shapesResponse = await fetch(`${convexUrl}/api/shapes2`, {
      headers: authHeaders(deployKey),
    });
    if (!shapesResponse.ok) {
      throw new Error(
        `HTTP ${shapesResponse.status}: ${await shapesResponse.text()}`,
      );
    }
    const shapes = z
      .record(z.string(), jsonValue)
      .parse(await shapesResponse.json());

    // Fetch declared schema
    const schemaResult = await postConvex(
      `${convexUrl}/api/query`,
      authHeaders(deployKey),
      { path: "_system/frontend/getSchemas", args: {}, format: "json" },
    );
    const schemaValue = z
      .object({ active: z.string().nullable() })
      .parse(schemaResult.value);

    let declaredTables: z.infer<typeof schemaTableSchema>[] = [];
    if (schemaValue.active) {
      const parsed = z
        .object({ tables: z.array(schemaTableSchema) })
        .parse(JSON.parse(schemaValue.active));
      declaredTables = parsed.tables;
    }

    const schemaByTable: Record<string, z.infer<typeof schemaTableSchema>> = {};
    for (const table of declaredTables) {
      schemaByTable[table.tableName] = table;
    }

    const allTableNames = new Set([
      ...Object.keys(shapes),
      ...Object.keys(schemaByTable),
    ]);
    const sortedNames = Array.from(allTableNames).sort();

    return sortedNames.map((name) => ({
      name,
      declaredSchema: schemaByTable[name] ?? null,
      inferredShape: shapes[name] ?? null,
    }));
  },
});

const paginationResultSchema = z.object({
  page: z.array(jsonValue),
  isDone: z.boolean(),
  continueCursor: z.string(),
});

export const queryTable = internalAction({
  args: {
    convexUrl: v.string(),
    deployKey: v.string(),
    table: v.string(),
    order: v.union(v.literal("asc"), v.literal("desc")),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (
    _ctx,
    { convexUrl, deployKey, table, order, numItems, cursor },
  ) => {
    const result = await postConvex(
      `${convexUrl}/api/query`,
      authHeaders(deployKey),
      {
        path: "_system/cli/tableData",
        args: { table, order, paginationOpts: { numItems, cursor } },
        format: "json",
      },
    );
    return paginationResultSchema.parse(result.value);
  },
});

type TestQueryResult =
  | { ok: true; value: JsonValue; logLines: string[] }
  | { ok: false; error: string };

export const runTestQuery = internalAction({
  args: { convexUrl: v.string(), deployKey: v.string(), code: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      value: v.any(),
      logLines: v.array(v.string()),
    }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (
    _ctx,
    { convexUrl, deployKey, code },
  ): Promise<TestQueryResult> => {
    const source = wrapQueryHandler(code);
    try {
      const result = await runTestQueryRemote(convexUrl, deployKey, source);
      return { ok: true, value: result.value, logLines: result.logLines };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: formatConvexQueryError(message) };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Team + artifact actions
// ─────────────────────────────────────────────────────────────────────────────

const teamSchema = z.object({ id: z.string(), name: z.string() });

export const listUserTeams = internalAction({
  args: { userId: v.string() },
  returns: v.array(v.object({ id: v.string(), name: v.string() })),
  handler: async (_ctx, { userId }) => {
    const deployKey = await getDeployKey();
    const source = wrapQueryHandler(
      `const userId = ${JSON.stringify(userId)};
      const memberships = await ctx.db.query("teamMembers").withIndex("by_user", q => q.eq("userId", userId)).collect();
      const teams = await Promise.all(memberships.map(m => ctx.db.get(m.teamId)));
      return teams.filter(Boolean).map(t => ({ id: t._id, name: t.name }));`,
    );
    const result = await runTestQueryRemote(
      getEvaConvexCloudUrl(),
      deployKey,
      source,
    );
    return z.array(teamSchema).parse(result.value);
  },
});

export const createArtifact = internalAction({
  args: {
    clerkUserId: v.string(),
    name: v.string(),
    html: v.string(),
    description: v.optional(v.string()),
    boundTeamId: v.string(),
    declaredTools: v.array(v.string()),
    sourceKind: v.optional(
      v.union(v.literal("session"), v.literal("task"), v.literal("project")),
    ),
    sourceId: v.optional(v.string()),
  },
  returns: v.object({ artifactId: v.string(), viewUrl: v.string() }),
  handler: async (
    _ctx,
    {
      clerkUserId,
      name,
      html,
      description,
      boundTeamId,
      declaredTools,
      sourceKind,
      sourceId,
    },
  ) => {
    // 1. Get a short-lived storage upload URL (as the user).
    const uploadUrl = await runAsUser(
      "mutation",
      clerkUserId,
      "artifacts:generateUploadUrl",
      {},
    );
    if (typeof uploadUrl !== "string") {
      throw new Error("Unexpected response from artifacts:generateUploadUrl");
    }

    // 2. Upload the HTML bytes to Convex storage.
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "text/html" },
      body: html,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Storage upload failed: HTTP ${uploadResponse.status}`);
    }
    const { storageId } = z
      .object({ storageId: z.string() })
      .parse(await uploadResponse.json());

    // 3. Create the artifact record (as the user; enforces team membership).
    const createArgs: Record<string, JsonValue> = {
      name,
      boundTeamId,
      declaredTools,
      htmlStorageId: storageId,
    };
    if (description) createArgs.description = description;
    if (sourceKind !== undefined && sourceId !== undefined) {
      createArgs.source = chatSourceArg(sourceKind, sourceId);
    }
    const artifactId = await runAsUser(
      "mutation",
      clerkUserId,
      "artifacts:create",
      createArgs,
    );
    if (typeof artifactId !== "string") {
      throw new Error("Unexpected response from artifacts:create");
    }

    return {
      artifactId,
      viewUrl: `${getWebAppUrl()}/artifacts/${artifactId}`,
    };
  },
});

export const getArtifact = internalAction({
  args: { clerkUserId: v.string(), artifactId: v.string() },
  returns: v.any(),
  handler: async (_ctx, { clerkUserId, artifactId }) => {
    const artifact = await runAsUser("query", clerkUserId, "artifacts:get", {
      id: artifactId,
    });
    if (artifact === null) return null;
    return {
      artifact,
      viewUrl: `${getWebAppUrl()}/artifacts/${artifactId}`,
    };
  },
});

export const listArtifacts = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.any(),
  handler: async (_ctx, { clerkUserId }) => {
    const artifacts = await runAsUser(
      "query",
      clerkUserId,
      "artifacts:listAll",
      {},
    );
    if (!Array.isArray(artifacts)) return [];
    const webAppUrl = getWebAppUrl();
    return artifacts.map((artifact) => {
      const id =
        artifact !== null &&
        typeof artifact === "object" &&
        !Array.isArray(artifact)
          ? artifact._id
          : null;
      return {
        artifact,
        viewUrl: typeof id === "string" ? `${webAppUrl}/artifacts/${id}` : null,
      };
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator actions (master session fleet control)
//
// Every call below goes through runAsUser, i.e. a
// signed user JWT hitting authQuery/authMutation. Their hasRepoAccess checks
// are the ONLY authorisation for orchestrator tools — unlike the repo-scoped
// tools these deliberately skip the sandbox token's single-repo pin, so the
// master can reach every agent the user can reach and nothing more.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State, stop and watch reach all three chat surfaces, including a project's
 * sandbox chat. Listing still only enumerates sessions and tasks.
 */
const agentKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);
type AgentKind = "session" | "task" | "project";

/** Every surface a chat message can be sent into. */
const chatKindValidator = v.union(
  v.literal("session"),
  v.literal("task"),
  v.literal("project"),
);

/** The user-authorised read that proves the caller may reach each surface. */
const CHAT_DOC_QUERY: Record<ChatTargetKind, string> = {
  session: "_sessions/queries:get",
  task: "_agentTasks/queries:get",
  project: "_projects/queries:get",
};

const orchestratorAgentValidator = v.object({
  kind: agentKindValidator,
  id: v.string(),
  numId: v.optional(v.number()),
  repo: v.string(),
  title: v.string(),
  status: v.string(),
  isExecuting: v.boolean(),
  model: v.optional(v.string()),
  updatedAt: v.number(),
});

interface OrchestratorAgent {
  kind: AgentKind;
  id: string;
  numId?: number;
  repo: string;
  title: string;
  status: string;
  isExecuting: boolean;
  model?: string;
  updatedAt: number;
}

/** Slim projection of `_sessions/queries:list` rows. */
const sessionListItemSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  numId: z.number().optional(),
  repoId: z.string(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.number().optional(),
  lastModel: z.string().optional(),
  isExecuting: z.boolean(),
});

/** Slim projection of an `agentTasks` document. */
const agentTaskSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  numId: z.number().optional(),
  repoId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.number(),
  model: z.string().optional(),
  lastChatModel: z.string().optional(),
  reviewTaskSandboxStatus: z.string().optional(),
});

/** One row of `getActiveTasksSlim`: the busy state is computed server-side. */
const agentTaskListItemSchema = z.object({
  _id: z.string(),
  numId: z.number().optional(),
  repoId: z.string().optional(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.number(),
  model: z.string().optional(),
  lastChatModel: z.string().optional(),
  isExecuting: z.boolean(),
});

/** Slim projection of a `projects` document (its chat mirrors a task's). */
const projectDocSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  numId: z.number().optional(),
  title: z.string(),
  phase: z.string(),
  updatedAt: z.number().optional(),
  activeWorkflowId: z.string().optional(),
  activeBuildWorkflowId: z.string().optional(),
  activeChatWorkflowId: z.string().optional(),
  reviewProjectSandboxStatus: z.string().optional(),
  model: z.string().optional(),
  lastChatModel: z.string().optional(),
});

/** Slim projection of a `sessions` document. */
const sessionDocSchema = z.object({
  _id: z.string(),
  _creationTime: z.number(),
  numId: z.number().optional(),
  repoId: z.string(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.number().optional(),
  lastModel: z.string().optional(),
  activeWorkflowId: z.string().optional(),
  deploymentUrl: z.string().optional(),
  deploymentStatus: z.string().optional(),
  linkedRepoCount: z.number().optional(),
});

const streamingStateSchema = z
  .object({
    currentActivity: z.string(),
    currentContent: z.string(),
    pendingQuestion: z.string().optional(),
  })
  .nullable();

const transcriptMessageSchema = z.object({
  _creationTime: z.number(),
  role: z.string(),
  content: z.string(),
  timestamp: z.number().optional(),
});

const createdSessionSchema = z.object({
  sessionId: z.string(),
  numId: z.number(),
});

/** Longest message body kept per transcript entry in `get_agent_state`. */
const TRANSCRIPT_CHAR_LIMIT = 2000;

/**
 * Points a child session/task/project at a Manager Ave thread so a later completion
 * can wake it, or clears the pointer when `aveThreadId` is omitted. Only
 * `unwatch_agent` wants the clearing behaviour — implicit registration must go
 * through `registerWatchIfAve`.
 */
async function setWatchedByAve(
  clerkUserId: string,
  kind: AgentKind,
  id: string,
  aveThreadId: string | undefined,
): Promise<void> {
  const { fn, idArg } = WATCH_MUTATION[kind];
  const args: Record<string, JsonValue> = { [idArg]: id };
  if (aveThreadId !== undefined) args.aveThreadId = aveThreadId;
  await runAsUser("mutation", clerkUserId, fn, args);
}

/** The watch-pointer mutation per surface, and the id argument it takes. */
const WATCH_MUTATION: Record<AgentKind, { fn: string; idArg: string }> = {
  session: { fn: "orchestratorWatch:setSessionWatchedBy", idArg: "sessionId" },
  task: { fn: "orchestratorWatch:setTaskWatchedBy", idArg: "taskId" },
  project: { fn: "orchestratorWatch:setProjectWatchedBy", idArg: "projectId" },
};

const aveThreadPointerSchema = z.object({ _id: z.string() }).nullable();

/**
 * Implicit watch registration for create/send. Ave's own run passes its thread;
 * any other MCP caller registers against the user's live thread, if they have
 * one. Never clears an existing watch — that is what `setWatchedByAve` would
 * do without a thread id.
 */
async function registerWatchIfAve(
  clerkUserId: string,
  kind: AgentKind,
  id: string,
  aveThreadId: string | undefined,
): Promise<void> {
  const resolved =
    aveThreadId ??
    aveThreadPointerSchema.parse(
      await runAsUser("query", clerkUserId, "ave:getThread", {}),
    )?._id;
  if (resolved === undefined) return;
  await setWatchedByAve(clerkUserId, kind, id, resolved);
}

export const orchestratorListAgents = internalAction({
  args: {
    clerkUserId: v.string(),
    repos: v.array(v.object({ id: v.string(), fullName: v.string() })),
    includeIdle: v.boolean(),
    excludeEntityId: v.optional(v.string()),
  },
  returns: v.array(orchestratorAgentValidator),
  handler: async (
    _ctx,
    { clerkUserId, repos, includeIdle, excludeEntityId },
  ): Promise<OrchestratorAgent[]> => {
    const repoNameById = new Map(repos.map((r) => [r.id, r.fullName]));

    const [sessionGroups, rawTasks] = await Promise.all([
      Promise.all(
        repos.map((repo) =>
          runAsUser("query", clerkUserId, "_sessions/queries:list", {
            repoId: repo.id,
          }),
        ),
      ),
      // Already user-wide, so one call covers every repo. The slim projection
      // keeps the fleet list cheap: full task docs measured up to 38KB each
      // (backgroundAgents, description), all of it discarded below.
      runAsUser(
        "query",
        clerkUserId,
        "_agentTasks/queries:getActiveTasksSlim",
        {},
      ),
    ]);

    const agents: OrchestratorAgent[] = [];
    for (const group of sessionGroups) {
      for (const item of z.array(sessionListItemSchema).parse(group)) {
        agents.push({
          kind: "session",
          id: item._id,
          numId: item.numId,
          repo: repoNameById.get(item.repoId) ?? item.repoId,
          title: item.title,
          status: item.status,
          isExecuting: item.isExecuting,
          model: item.lastModel,
          updatedAt: item.updatedAt ?? item._creationTime,
        });
      }
    }
    for (const task of z.array(agentTaskListItemSchema).parse(rawTasks)) {
      // Keep tasks inside the requested repo scope (all repos, or one).
      if (task.repoId === undefined) continue;
      const repoName = repoNameById.get(task.repoId);
      if (repoName === undefined) continue;
      agents.push({
        kind: "task",
        id: task._id,
        numId: task.numId,
        repo: repoName,
        title: task.title,
        status: task.status,
        isExecuting: task.isExecuting,
        model: task.lastChatModel ?? task.model,
        updatedAt: task.updatedAt,
      });
    }

    return agents
      .filter((agent) => agent.id !== excludeEntityId)
      .filter((agent) => includeIdle || agent.isExecuting)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * `get_agent_state`'s result. Named (rather than inline) so the handler can be
 * annotated with its own shape: an action's registered type comes from the
 * handler's *inferred* return type, so a handler that reads back through
 * `internal` — as the session branch does for its linked repos — would
 * otherwise make `internal` depend on itself.
 */
const orchestratorAgentStateValidator = v.object({
  kind: agentKindValidator,
  id: v.string(),
  numId: v.optional(v.number()),
  title: v.string(),
  status: v.string(),
  isExecuting: v.boolean(),
  model: v.optional(v.string()),
  updatedAt: v.number(),
  deploymentUrl: v.optional(v.string()),
  deploymentStatus: v.optional(v.string()),
  currentActivity: v.optional(v.string()),
  currentContent: v.optional(v.string()),
  pendingQuestion: v.optional(v.string()),
  queuedMessageCount: v.number(),
  /** Projects only: a build runs apart from the chat and stop_agent leaves it. */
  buildRunning: v.optional(v.boolean()),
  transcript: v.array(
    v.object({
      role: v.string(),
      content: v.string(),
      timestamp: v.number(),
      truncated: v.boolean(),
    }),
  ),
  /** Every PR the chat holds, primary first, then newest first. */
  pullRequests: v.array(mcpPullRequestValidator),
  /** Sessions only, and only when it has linked repos beside its primary. */
  linkedRepos: v.optional(
    v.array(
      v.object({
        repo: v.string(),
        path: v.string(),
        branch: v.string(),
        prUrl: v.optional(v.string()),
        prState: v.optional(prStateValidator),
      }),
    ),
  ),
});

export const orchestratorGetAgentState = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: agentKindValidator,
    id: v.string(),
    transcriptTail: v.number(),
  },
  returns: orchestratorAgentStateValidator,
  handler: async (
    ctx,
    { clerkUserId, kind, id, transcriptTail },
  ): Promise<Infer<typeof orchestratorAgentStateValidator>> => {
    const streamingEntityId =
      kind === "session"
        ? id
        : `${kind === "task" ? TASK_CHAT_STREAM_PREFIX : PROJECT_CHAT_STREAM_PREFIX}${id}`;

    // The access check runs first, on its own. `messages:listByParent` *throws*
    // "Not authorized" while the entity read merely returns null, so in a
    // Promise.all the raw throw won the race and the agent saw a stack instead
    // of the sentence below.
    const hit = await readChatDocAsUser(clerkUserId, kind, id);

    // Same rule as list_agents / stop_sandbox: a daemon `/loop` continuation
    // never sets `activeWorkflowId`, so that field alone is not "is executing".
    const isExecuting: boolean = await ctx.runQuery(
      internal.mcp.queries.entityIsExecuting,
      { kind, id },
    );

    const [rawStreaming, rawMessages, queued] = await Promise.all([
      runAsUser("query", clerkUserId, "streaming:get", {
        entityId: streamingEntityId,
      }),
      runAsUser("query", clerkUserId, "messages:listByParent", {
        parentId: id,
      }),
      listQueuedAsUser(clerkUserId, id),
    ]);

    const streaming = streamingStateSchema.parse(rawStreaming);
    const queuedMessageCount = queued.length;
    const messages = z.array(transcriptMessageSchema).parse(rawMessages);
    const tail = transcriptTail > 0 ? messages.slice(-transcriptTail) : [];
    const transcript = tail.map((message) => ({
      role: message.role,
      content: message.content.slice(0, TRANSCRIPT_CHAR_LIMIT),
      timestamp: message.timestamp ?? message._creationTime,
      truncated: message.content.length > TRANSCRIPT_CHAR_LIMIT,
    }));

    const pullRequests = await ctx.runQuery(
      internal.mcp.queries.chatPullRequests,
      { kind, id },
    );
    const common = {
      kind,
      id,
      pullRequests,
      queuedMessageCount,
      transcript,
      currentActivity: streaming?.currentActivity,
      currentContent: streaming?.currentContent,
      pendingQuestion: streaming?.pendingQuestion,
      isExecuting,
    };

    if (hit.kind === "session") {
      const session = hit.doc;
      const linkedRepos: McpLinkedRepo[] | undefined =
        session.linkedRepoCount !== undefined && session.linkedRepoCount > 0
          ? await ctx.runQuery(internal.mcp.queries.sessionLinkedRepos, {
              sessionId: id,
            })
          : undefined;
      return {
        ...common,
        numId: session.numId,
        title: session.title,
        status: session.status,
        model: session.lastModel,
        updatedAt: session.updatedAt ?? session._creationTime,
        deploymentUrl: session.deploymentUrl,
        deploymentStatus: session.deploymentStatus,
        linkedRepos,
      };
    }

    if (hit.kind === "project") {
      const project = hit.doc;
      return {
        ...common,
        numId: project.numId,
        title: project.title,
        status: project.phase,
        model: project.lastChatModel ?? project.model,
        updatedAt: project.updatedAt ?? project._creationTime,
        deploymentUrl: undefined,
        deploymentStatus: undefined,
        buildRunning: project.activeBuildWorkflowId !== undefined,
      };
    }

    const task = hit.doc;
    return {
      ...common,
      numId: task.numId,
      title: task.title,
      status: task.status,
      model: task.lastChatModel ?? task.model,
      updatedAt: task.updatedAt,
      deploymentUrl: undefined,
      deploymentStatus: undefined,
    };
  },
});

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ChatDocHit =
  | { kind: "session"; doc: z.infer<typeof sessionDocSchema> }
  | { kind: "task"; doc: z.infer<typeof agentTaskSchema> }
  | { kind: "project"; doc: z.infer<typeof projectDocSchema> };

/**
 * Reads one chat's own document as the calling user, so the read doubles as
 * the access check. Throws one plain sentence when it is missing or hidden.
 */
async function readChatDocAsUser(
  clerkUserId: string,
  kind: ChatTargetKind,
  id: string,
): Promise<ChatDocHit> {
  const raw = await runAsUser("query", clerkUserId, CHAT_DOC_QUERY[kind], {
    id,
  });
  if (raw === null) {
    throw new Error(`No ${kind} ${id} found, or you do not have access.`);
  }
  if (kind === "session") return { kind, doc: sessionDocSchema.parse(raw) };
  if (kind === "task") return { kind, doc: agentTaskSchema.parse(raw) };
  return { kind, doc: projectDocSchema.parse(raw) };
}

/**
 * Reads one entity's preview sandbox state as the calling user, so the read
 * doubles as the access check. Each surface parks that state somewhere
 * different: a session in `status`, a task and a project in their own
 * `review*SandboxStatus` field.
 *
 * Deliberately not "is a turn running" — that answer needs the `turns` table,
 * which no per-entity read exposes (see `mcp.queries.entityIsExecuting`).
 */
async function readEntitySandboxStatus(
  clerkUserId: string,
  kind: ChatTargetKind,
  id: string,
): Promise<string> {
  const hit = await readChatDocAsUser(clerkUserId, kind, id);
  if (hit.kind === "session") return hit.doc.status;
  if (hit.kind === "task") return hit.doc.reviewTaskSandboxStatus ?? "closed";
  return hit.doc.reviewProjectSandboxStatus ?? "closed";
}

/**
 * Brings one entity's preview sandbox up and waits until it is actually
 * `active`. A completed entity tears its sandbox down, and resuming the closed
 * id in-place hangs on "Resuming sandbox…", so this drives the same
 * Start-button mutation the Eva UI does and then polls.
 *
 * Returns whether it had to issue a start; throws — rather than returning a
 * half-started sandbox — when the VM never comes up.
 */
async function ensureEntitySandboxActive(
  clerkUserId: string,
  kind: ChatTargetKind,
  id: string,
): Promise<{ startRequested: boolean }> {
  const surface = SANDBOX_SURFACES[kind];
  return await awaitSandboxActive({
    kind,
    readStatus: () => readEntitySandboxStatus(clerkUserId, kind, id),
    start: async () => {
      await runAsUser("mutation", clerkUserId, surface.start, {
        [surface.idArg]: id,
      });
    },
    sleep: delay,
  });
}

/**
 * Decides whether a message starts a turn or joins the queue, and which model
 * the turn falls back to. `isExecuting` is `entityIsExecuting`: the open
 * durable turn (synthetic turns included), plus a task's main run or a
 * project's build. A busy answer is always safe — the queue drain starts the
 * message at once when the chat itself is free.
 */
function chatDelivery(
  hit: ChatDocHit,
  queuedAhead: number,
  requestedModel: string | undefined,
  isExecuting: boolean,
): AgentDelivery {
  const isBusy = isExecuting || queuedAhead > 0;
  if (hit.kind === "session") {
    return resolveAgentDelivery({
      isBusy,
      requestedModel,
      storedModel: hit.doc.lastModel,
    });
  }
  if (hit.kind === "task") {
    return resolveAgentDelivery({
      isBusy,
      requestedModel,
      storedModel: hit.doc.lastChatModel ?? hit.doc.model,
    });
  }
  return resolveAgentDelivery({
    isBusy,
    requestedModel,
    storedModel: hit.doc.lastChatModel ?? hit.doc.model,
  });
}

export const orchestratorSendMessage = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: chatKindValidator,
    id: v.string(),
    message: v.string(),
    model: v.optional(v.string()),
    aveThreadId: v.optional(v.string()),
    /**
     * Stamps the "via MCP" chat badge. True for every MCP send — master
     * sandbox and user OAuth connector alike — so the row is not mistaken
     * for a composer-typed turn.
     */
    sentViaOrchestrator: v.boolean(),
  },
  returns: v.object({
    delivered: v.union(v.literal("started"), v.literal("queued")),
    model: v.string(),
  }),
  handler: async (
    ctx,
    { clerkUserId, kind, id, message, model, aveThreadId, sentViaOrchestrator },
  ) => {
    const hit = await readChatDocAsUser(clerkUserId, kind, id);

    if (kind === "task") {
      await ensureEntitySandboxActive(clerkUserId, kind, id);
    }

    // A child with anything already queued is NOT idle, even with no workflow
    // in flight: a brand-new session parks its first turn in the queue until
    // its sandbox reports ready. Starting a turn then would run this message
    // ahead of the one the child was created with (observed live: "probe
    // second message" answered while "probe first message" sat queued).
    const queuedAhead = (await listQueuedAsUser(clerkUserId, id)).length;

    const isExecuting: boolean = await ctx.runQuery(
      internal.mcp.queries.entityIsExecuting,
      { kind, id },
    );
    const delivery = chatDelivery(hit, queuedAhead, model, isExecuting);
    for (const call of buildChatMessageCalls({
      kind,
      id,
      message,
      delivery,
      sentViaOrchestrator,
    })) {
      await runAsUser("mutation", clerkUserId, call.fn, call.args);
    }

    await registerWatchIfAve(clerkUserId, kind, id, aveThreadId);
    const delivered: "queued" | "started" =
      delivery.action === "queue" ? "queued" : "started";
    return { delivered, model: delivery.model };
  },
});

export const orchestratorStopAgent = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: agentKindValidator,
    id: v.string(),
  },
  returns: v.object({ buildRunning: v.boolean() }),
  handler: async (_ctx, { clerkUserId, kind, id }) => {
    if (kind === "session") {
      await runAsUser(
        "mutation",
        clerkUserId,
        "_sessions/execution:cancelExecution",
        { sessionId: id },
      );
      return { buildRunning: false };
    }
    if (kind === "project") {
      // Only the sandbox chat. A running build is its own workflow and is
      // reported back rather than cancelled (cancel_project_build owns that).
      const hit = await readChatDocAsUser(clerkUserId, "project", id);
      await runAsUser(
        "mutation",
        clerkUserId,
        "projectChatWorkflow:cancelExecution",
        { projectId: id },
      );
      return {
        buildRunning:
          hit.kind === "project" && hit.doc.activeBuildWorkflowId !== undefined,
      };
    }
    // A task has two independent workflow slots: its main run and its sandbox
    // chat. Cancelling only the chat one reported success while a run kept
    // going, so stop both — each cancel is a no-op when that slot is idle.
    await runAsUser(
      "mutation",
      clerkUserId,
      "agentTaskChatWorkflow:cancelExecution",
      { taskId: id },
    );
    await runAsUser(
      "mutation",
      clerkUserId,
      "_taskWorkflow/publicMutations:cancelExecution",
      { taskId: id },
    );
    return { buildRunning: false };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Preview sandbox start/stop and queued-message cancellation.
//
// Every write here is one the user can already make in the Eva UI, run through
// the same public mutation as that button. None of them touch status or review
// state — a person still owns where a task sits in the workflow.
// ─────────────────────────────────────────────────────────────────────────────

export const mcpStartEntitySandbox = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: chatKindValidator,
    id: v.string(),
  },
  returns: v.object({
    sandboxStatus: v.string(),
    startRequested: v.boolean(),
  }),
  handler: async (_ctx, { clerkUserId, kind, id }) => {
    const { startRequested } = await ensureEntitySandboxActive(
      clerkUserId,
      kind,
      id,
    );
    // ensureEntitySandboxActive only returns once the VM is up, so there is no
    // "resuming" limbo to report back.
    return { sandboxStatus: "active", startRequested };
  },
});

export const mcpStopEntitySandbox = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: chatKindValidator,
    id: v.string(),
  },
  returns: v.object({
    sandboxStatus: v.string(),
    stopRequested: v.boolean(),
  }),
  handler: async (ctx, { clerkUserId, kind, id }) => {
    // Reading the entity as the user is the access check, so it comes first —
    // the turn lookup below runs on an id the caller has already proven.
    const sandboxStatus = await readEntitySandboxStatus(clerkUserId, kind, id);

    // Tearing the VM down mid-turn kills the turn. Stopping and cancelling are
    // separate decisions, so this refuses rather than deciding for the caller.
    const isExecuting = await ctx.runQuery(
      internal.mcp.queries.entityIsExecuting,
      { kind, id },
    );
    if (isExecuting) {
      throw new Error(
        `This ${kind} has a turn in flight. Wait for it to finish and stop again, or cancel it first with stop_agent.`,
      );
    }

    if (sandboxStatus === "closed") {
      return { sandboxStatus: "closed", stopRequested: false };
    }

    const surface = SANDBOX_SURFACES[kind];
    await runAsUser("mutation", clerkUserId, surface.stop, {
      [surface.idArg]: id,
    });

    // Teardown finalizes in a scheduled action, so poll for the settled state
    // rather than reporting "stopped" the instant the mutation returns.
    const deadline = Date.now() + SANDBOX_STOP_SETTLE_TIMEOUT_MS;
    let settled = "stopping";
    while (Date.now() < deadline) {
      await delay(TASK_PREVIEW_SANDBOX_READY_POLL_MS);
      settled = await readEntitySandboxStatus(clerkUserId, kind, id);
      if (settled !== "stopping") break;
    }
    // A still-`stopping` status is reported as-is: the stop was accepted and
    // will finalize, and claiming "closed" here would be a guess.
    return { sandboxStatus: settled, stopRequested: true };
  },
});

const queuedMessageSchema = z.object({
  _id: z.string(),
  content: z.string(),
  createdAt: z.number(),
  order: z.number().optional(),
});

/** One chat's pending queue, read as the user (the read is the access check). */
async function listQueuedAsUser(clerkUserId: string, parentId: string) {
  return z.array(queuedMessageSchema).parse(
    await runAsUser("query", clerkUserId, "queuedMessages:listByParent", {
      parentId,
    }),
  );
}

export const mcpCancelQueuedMessages = internalAction({
  args: {
    clerkUserId: v.string(),
    id: v.string(),
    /** One queued message to drop. Omitted with `all`, which drops every one. */
    queuedMessageId: v.optional(v.string()),
    all: v.boolean(),
  },
  returns: v.object({
    cancelled: v.array(v.object({ id: v.string(), content: v.string() })),
    remaining: v.number(),
  }),
  handler: async (_ctx, { clerkUserId, id, queuedMessageId, all }) => {
    const queued = await listQueuedAsUser(clerkUserId, id);
    let doomed = queued;
    if (!all) {
      const match = queued.find((message) => message._id === queuedMessageId);
      if (!match) {
        const pending = queued.map((message) => message._id).join(", ");
        throw new Error(
          queued.length === 0
            ? "Nothing is queued on this chat. A turn already running is cancelled with stop_agent, not here."
            : `No queued message ${queuedMessageId} on this chat. Pending ids: ${pending}`,
        );
      }
      doomed = [match];
    }

    for (const message of doomed) {
      await runAsUser("mutation", clerkUserId, "queuedMessages:remove", {
        id: message._id,
      });
    }

    // Re-read rather than subtracting: the chat may have drained a message of
    // its own while this action was deleting others. A drained message is also
    // gone from the queue, which is why the tool tells the caller that a
    // same-instant dequeue cannot be taken back.
    const remaining = await listQueuedAsUser(clerkUserId, id);
    const stillQueued = new Set(remaining.map((message) => message._id));
    return {
      cancelled: doomed
        .filter((message) => !stillQueued.has(message._id))
        .map((message) => ({ id: message._id, content: message.content })),
      remaining: remaining.length,
    };
  },
});

export const orchestratorCreateSession = internalAction({
  args: {
    clerkUserId: v.string(),
    repoId: v.string(),
    title: v.optional(v.string()),
    message: v.string(),
    baseBranch: v.optional(v.string()),
    aveThreadId: v.optional(v.string()),
    /** Extra repos to clone beside `repoId`. Mutually exclusive with `repoGroupId`. */
    linkedRepoIds: v.optional(v.array(v.string())),
    /** Saved codebase group whose members prefill the selection. */
    repoGroupId: v.optional(v.string()),
    installDependencies: v.optional(v.boolean()),
  },
  returns: v.object({
    sessionId: v.string(),
    numId: v.number(),
    linkedRepos: v.array(v.object({ repo: v.string(), path: v.string() })),
  }),
  handler: async (
    ctx,
    {
      clerkUserId,
      repoId,
      title,
      message,
      baseBranch,
      aveThreadId,
      linkedRepoIds,
      repoGroupId,
      installDependencies,
    },
  ) => {
    // No model: `_sessions/mutations:create` resolves `repo.defaultModel`.
    // Passing normalizeAIModel(undefined) here used to force claude:sonnet on
    // every MCP-created session regardless of the repo's configured default.
    const createArgs: Record<string, JsonValue> = {
      repoId,
      message,
      sentViaOrchestrator: true,
    };
    if (title) createArgs.title = title;
    if (baseBranch) createArgs.baseBranch = baseBranch;
    if (linkedRepoIds && linkedRepoIds.length > 0) {
      createArgs.linkedRepoIds = linkedRepoIds;
    }
    if (repoGroupId) createArgs.repoGroupId = repoGroupId;
    if (installDependencies !== undefined) {
      createArgs.installDependencies = installDependencies;
    }

    const created = createdSessionSchema.parse(
      await runAsUser(
        "mutation",
        clerkUserId,
        "_sessions/mutations:create",
        createArgs,
      ),
    );
    await registerWatchIfAve(
      clerkUserId,
      "session",
      created.sessionId,
      aveThreadId,
    );
    const linkedRepos: McpLinkedRepo[] = await ctx.runQuery(
      internal.mcp.queries.sessionLinkedRepos,
      { sessionId: created.sessionId },
    );
    return {
      ...created,
      linkedRepos: linkedRepos.map((link) => ({
        repo: link.repo,
        path: link.path,
      })),
    };
  },
});

export const orchestratorSetWatch = internalAction({
  args: {
    clerkUserId: v.string(),
    kind: agentKindValidator,
    id: v.string(),
    aveThreadId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, { clerkUserId, kind, id, aveThreadId }) => {
    await setWatchedByAve(clerkUserId, kind, id, aveThreadId);
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Proxy Helpers
// ─────────────────────────────────────────────────────────────────────────────

const supabaseTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

export const resolveSupabaseToken = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { clerkUserId }): Promise<string | null> => {
    const cached = supabaseTokenCache.get(clerkUserId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const deployKey = await getDeployKey();
    const userId = await resolveUserByClerkId(deployKey, clerkUserId);
    if (!userId) return null;

    // Get repos and search for SUPABASE_ACCESS_TOKEN
    const source = wrapQueryHandler(
      `const userId = ${JSON.stringify(userId)};
      const memberships = await ctx.db.query("teamMembers").withIndex("by_user", q => q.eq("userId", userId)).collect();
      const teamRepoResults = await Promise.all(memberships.map(m => ctx.db.query("githubRepos").withIndex("by_team", q => q.eq("teamId", m.teamId)).collect()));
      const connectedRepos = await ctx.db.query("githubRepos").withIndex("by_connected_by", q => q.eq("connectedBy", userId)).collect();
      const seen = new Set();
      const result = [];
      for (const repo of [...connectedRepos, ...teamRepoResults.flat()]) {
        if (seen.has(String(repo._id))) continue;
        seen.add(String(repo._id));
        result.push(repo._id);
      }
      return result;`,
    );
    const result = await runTestQueryRemote(
      getEvaConvexCloudUrl(),
      deployKey,
      source,
    );
    const repoIds = z.array(z.string()).parse(result.value);

    // Search for Supabase token in each repo's env vars
    for (const repoId of repoIds) {
      try {
        const vars: EnvVar[] = await ctx.runAction(
          internal.mcp.routes.getDecryptedRepoEnvVars,
          { repoId },
        );
        const match: EnvVar | undefined = vars.find(
          (entry) => entry.key === "SUPABASE_ACCESS_TOKEN",
        );
        if (match) {
          supabaseTokenCache.set(clerkUserId, {
            token: match.value,
            expiresAt: Date.now() + CACHE_TTL_MS,
          });
          return match.value;
        }
      } catch {
        // Skip failed repos
      }
    }

    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP Request Handler
// ─────────────────────────────────────────────────────────────────────────────

export const handleMcpRequest = internalAction({
  args: {
    clerkUserId: v.string(),
    scopedRepoId: v.optional(v.string()),
    entityId: v.optional(v.string()),
    entityKind: v.optional(
      v.union(v.literal("session"), v.literal("task"), v.literal("project")),
    ),
    body: v.string(),
  },
  returns: v.object({
    status: v.number(),
    body: v.string(),
  }),
  handler: async (
    ctx,
    { clerkUserId, scopedRepoId, entityId, entityKind, body },
  ) => {
    try {
      const parsedBody = JSON.parse(body);

      // Create MCP server with tools registered
      const server = new McpServer({
        name: "eva-mcp",
        version: "1.0.0",
      });

      // Register tools with credentials (including optional scoped repo /
      // session entity for browser tools).
      const credentials = {
        clerkUserId,
        scopedRepoId,
        entityId,
        entityKind,
      };
      const tools = buildTools(credentials, ctx);
      let supabase: EvaTool[] = [];
      try {
        supabase = await supabaseTools(credentials, ctx);
      } catch (err) {
        console.error(
          "[MCP][handleMcpRequest] supabase tools registration failed (continuing):",
          err instanceof Error ? err.message : err,
        );
      }
      const allTools = [...tools, ...supabase];
      // Code mode is additive: `execute` and `search_tools` sit beside the flat
      // tools and dispatch to the same definitions.
      mountFlat(server, [...allTools, ...codeModeTools(allTools)]);

      // Create transport in stateless mode with JSON responses (no SSE).
      // WebStandardStreamableHTTPServerTransport works with Web Standard
      // Request/Response, avoiding Node.js req/res shimming entirely.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Connect server to transport
      await server.connect(transport);

      // Build a Web Standard Request for the transport.
      // The transport validates Accept + Content-Type headers.
      const req = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body,
      });

      const response = await transport.handleRequest(req, { parsedBody });
      const responseBody = await response.text();

      return {
        status: response.status,
        body: responseBody,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error("[MCP][handleMcpRequest] threw:", message, err);
      return {
        status: 500,
        body: JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message },
          id: null,
        }),
      };
    }
  },
});
