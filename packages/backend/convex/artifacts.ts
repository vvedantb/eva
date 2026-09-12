import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  authQuery,
  authMutation,
  authAction,
  hasTeamAccess,
} from "./functions";
import { artifactFields } from "./validators";
import {
  isSandboxIdentity,
  rejectSandboxCaller,
} from "./_auth/sandboxIdentity";

// ─────────────────────────────────────────────────────────────────────────────
// Return validators (composed from the single-source-of-truth artifactFields)
// ─────────────────────────────────────────────────────────────────────────────

const artifactDoc = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  ...artifactFields,
});

// get() resolves the stored HTML to a (time-limited, signed) storage URL.
const artifactWithUrl = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  ...artifactFields,
  url: v.union(v.string(), v.null()),
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP CallToolResult envelope
//
// Mirrors `textResult`/`errorResult` in mcp/tools.ts. Re-declared here (rather
// than imported) because mcp/tools.ts pulls in the MCP SDK and only runs in the
// "use node" runtime; this module runs in the default isolate. The shape is kept
// byte-identical so hosted artifacts (which parse `content[].text`) work
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function textResult(
  data: Record<string, unknown> | Array<unknown>,
): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** Temporary upload URL for the artifact HTML (client POSTs the file, then calls create). */
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await rejectSandboxCaller(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

// Tools a hosted artifact is allowed to invoke through the bridge. Read-only
// only: no task creation or other write tools. This list — not the artifact's
// declared `mcpTools` — is the runtime gate. Supabase tools are allowed by
// prefix: eva only ever registers the read-only Supabase subset (its remote is
// pinned to ?read_only=true and filtered by READ_ONLY_SUPABASE_TOOLS in
// mcp/supabase.ts), so no write Supabase tool can reach the bridge.
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "postgres_query",
  "query_table",
  "run_query",
  "get_document",
  "count_table",
  "list_repos",
  "list_tables",
]);

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name) || name.startsWith("supabase_");
}

/** Records an uploaded artifact against a team. Caller must be a member of that team. */
export const create = authMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    boundTeamId: v.id("teams"),
    declaredTools: v.array(v.string()),
    htmlStorageId: v.id("_storage"),
  },
  returns: v.id("artifacts"),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    if (!(await hasTeamAccess(ctx.db, args.boundTeamId, ctx.userId))) {
      throw new Error("Not authorized: you are not a member of this team.");
    }
    return ctx.db.insert("artifacts", {
      ...args,
      uploadedBy: ctx.userId,
      createdAt: Date.now(),
    });
  },
});

/** Fetches one artifact plus a signed URL for its HTML; null if missing or no team access. */
export const get = authQuery({
  // Accept a raw string (the route param) and normalise it, so callers never
  // need an `as Id<...>` cast at the route boundary.
  args: { id: v.string() },
  returns: v.union(artifactWithUrl, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("artifacts", args.id);
    if (!id) return null;
    const artifact = await ctx.db.get(id);
    if (!artifact) return null;
    if (!(await hasTeamAccess(ctx.db, artifact.boundTeamId, ctx.userId))) {
      return null;
    }
    return {
      ...artifact,
      url: await ctx.storage.getUrl(artifact.htmlStorageId),
    };
  },
});

/** Lists a team's artifacts (newest first). Empty if the caller is not a member. */
export const listForTeam = authQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(artifactDoc),
  handler: async (ctx, args) => {
    if (!(await hasTeamAccess(ctx.db, args.teamId, ctx.userId))) return [];
    return ctx.db
      .query("artifacts")
      .withIndex("by_team", (q) => q.eq("boundTeamId", args.teamId))
      .order("desc")
      .collect();
  },
});

/** Lists every artifact across all teams the caller belongs to (newest first). */
export const listAll = authQuery({
  args: {},
  returns: v.array(artifactDoc),
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const perTeam = await Promise.all(
      memberships.map((m) =>
        ctx.db
          .query("artifacts")
          .withIndex("by_team", (q) => q.eq("boundTeamId", m.teamId))
          .collect(),
      ),
    );
    return perTeam.flat().sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Deletes an artifact and its stored HTML. Allowed for any member of the bound team. */
export const remove = authMutation({
  args: { id: v.id("artifacts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.id);
    if (!artifact) throw new Error("Artifact not found");
    if (!(await hasTeamAccess(ctx.db, artifact.boundTeamId, ctx.userId))) {
      throw new Error("Not authorized: you are not a member of this team.");
    }
    await ctx.storage.delete(artifact.htmlStorageId);
    await ctx.db.delete(args.id);
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// The bridge: window.cowork.callMcpTool → here
//
// A hosted artifact (running in a sandboxed iframe) posts its callMcpTool
// requests to the parent, which forwards them here. We re-dispatch eva's
// existing read-only MCP tools as the SIGNED-IN user — no OAuth, no MCP wire
// protocol — and return the identical envelope so the artifact runs unmodified.
//
// Access is enforced per call against the caller's own repo access
// (checkRepoAccessForUser = repo owner OR team member). Team binding only scopes
// where the artifact is listed; a call may target any repo the caller can reach.
// ─────────────────────────────────────────────────────────────────────────────

// Claude names MCP tools `mcp__<serverId>__<bareName>`. Strip through the last
// "__" (serverIds can themselves contain "__", so lastIndexOf is correct).
function bareToolName(toolName: string): string {
  const idx = toolName.lastIndexOf("__");
  return idx === -1 ? toolName : toolName.slice(idx + 2);
}

// Per-tool argument schemas, mirroring the zod shapes (and defaults) in
// mcp/tools.ts. The action receives `args` as a JSON string; each tool parses it
// with its schema, so the parsed value is precisely typed without `any`/`as`.
const postgresQueryArgs = z.object({
  sql: z.string(),
  limit: z.number().max(1000).default(100),
  repoId: z.string(),
});
const environmentArg = z.enum(["staging", "prod"]).default("prod");
const queryTableArgs = z.object({
  table: z.string(),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().max(1000).default(100),
  cursor: z.string().optional(),
  repoId: z.string(),
  environment: environmentArg,
});
const runQueryArgs = z.object({
  code: z.string(),
  repoId: z.string(),
  environment: environmentArg,
});
const getDocumentArgs = z.object({
  id: z.string(),
  repoId: z.string(),
  environment: environmentArg,
});
const countTableArgs = z.object({
  table: z.string(),
  repoId: z.string(),
  environment: environmentArg,
});

/** Throws unless the caller can access the repo (owner or team member). */
async function assertRepoAccess(
  ctx: ActionCtx,
  repoId: string,
  userId: Id<"users">,
): Promise<void> {
  const ok = await ctx.runQuery(internal.mcp.queries.checkRepoAccessForUser, {
    repoId,
    userId,
  });
  if (!ok) {
    throw new Error("Access denied: you do not have access to this repo.");
  }
}

/** Asserts access, then resolves the repo's Convex credentials for the environment. */
async function resolveCreds(
  ctx: ActionCtx,
  repoId: string,
  userId: Id<"users">,
  environment: "staging" | "prod",
): Promise<{ convexUrl: string; deployKey: string }> {
  await assertRepoAccess(ctx, repoId, userId);
  const creds = await ctx.runAction(
    internal.mcp.nodeActions.getRepoConvexCredentials,
    { repoId, userId, environment },
  );
  if (!creds) {
    throw new Error(
      `Repo ${repoId} has no Convex credentials configured for "${environment}". Add them in the repo's Environment Variables in Eva.`,
    );
  }
  return creds;
}

// Read-only tools that aren't dispatched directly above — Supabase (discovered
// dynamically from its remote MCP) and list_tables — are forwarded to eva's MCP
// server via a single stateless tools/call, the same path the hosted /mcp
// endpoint uses. This keeps the bridge in sync with the server's tool registry
// without re-implementing each tool here.
async function callViaMcpServer(
  ctx: ActionCtx,
  userId: Id<"users">,
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  const clerkUserId = await ctx.runQuery(internal.auth.getUserClerkId, {
    userId,
  });
  if (!clerkUserId) return errorResult("Could not resolve your account.");
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: JSON.parse(argsJson) },
  });
  const res = await ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, {
    clerkUserId,
    body,
  });
  return parseMcpResponse(res.body);
}

const mcpContentItem = z
  .object({ type: z.string(), text: z.string().optional() })
  .passthrough();
const mcpRpcResponse = z.object({
  result: z
    .object({
      content: z.array(mcpContentItem).optional(),
      isError: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});

function textItem(text: string): { type: "text"; text: string } {
  return { type: "text", text };
}

/** Normalises a JSON-RPC tools/call response into the strict text envelope. */
function parseMcpResponse(body: string): ToolResult {
  let rpc: z.infer<typeof mcpRpcResponse>;
  try {
    rpc = mcpRpcResponse.parse(JSON.parse(body));
  } catch {
    return errorResult("Unexpected response from the MCP server.");
  }
  if (rpc.error) return errorResult(rpc.error.message);
  const items = rpc.result?.content ?? [];
  const content = items.map((item) =>
    textItem(typeof item.text === "string" ? item.text : JSON.stringify(item)),
  );
  if (content.length === 0) {
    content.push(textItem(JSON.stringify(rpc.result ?? {})));
  }
  return rpc.result?.isError ? { content, isError: true } : { content };
}

export const callTool = authAction({
  args: { toolName: v.string(), args: v.string() },
  returns: v.object({
    content: v.array(v.object({ type: v.literal("text"), text: v.string() })),
    isError: v.optional(v.boolean()),
  }),
  handler: async (ctx, { toolName, args }): Promise<ToolResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (isSandboxIdentity(identity)) {
      throw new Error("Not authorized");
    }
    const name = bareToolName(toolName);
    if (!isReadOnlyTool(name)) {
      return errorResult(
        `Tool "${name}" is not available in hosted artifacts.`,
      );
    }
    const userId = ctx.userId;

    try {
      switch (name) {
        case "list_repos": {
          const repos: Array<{
            id: string;
            owner: string;
            name: string;
            rootDirectory: string | null;
            mcpRootPrompt: string | null;
          }> = await ctx.runAction(internal.mcp.nodeActions.listUserRepos, {
            userId,
          });
          const replicaIds = new Set(
            await ctx.runQuery(internal.mcp.queries.reposWithPostgresReplica, {
              repoIds: repos.map((r) => r.id),
            }),
          );
          return textResult(
            repos.map((r) => ({
              id: r.id,
              owner: r.owner,
              name: r.name,
              app: r.rootDirectory,
              hasPostgresReplica: replicaIds.has(r.id),
            })),
          );
        }

        case "postgres_query": {
          const a = postgresQueryArgs.parse(JSON.parse(args));
          await assertRepoAccess(ctx, a.repoId, userId);
          const result = await ctx.runAction(
            internal.mcp.postgres.runPostgresQuery,
            { repoId: a.repoId, sql: a.sql, maxRows: a.limit },
          );
          if (!result.ok) {
            return errorResult(`Postgres query failed: ${result.error}`);
          }
          return textResult({
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount,
            truncated: result.truncated,
          });
        }

        case "query_table": {
          const a = queryTableArgs.parse(JSON.parse(args));
          const t = await resolveCreds(ctx, a.repoId, userId, a.environment);
          const result = await ctx.runAction(
            internal.mcp.nodeActions.queryTable,
            {
              convexUrl: t.convexUrl,
              deployKey: t.deployKey,
              table: a.table,
              order: a.order,
              numItems: a.limit,
              cursor: a.cursor ?? null,
            },
          );
          return textResult({
            page: result.page,
            isDone: result.isDone,
            continueCursor: result.continueCursor,
            count: result.page.length,
          });
        }

        case "run_query": {
          const a = runQueryArgs.parse(JSON.parse(args));
          const t = await resolveCreds(ctx, a.repoId, userId, a.environment);
          const result = await ctx.runAction(
            internal.mcp.nodeActions.runTestQuery,
            { convexUrl: t.convexUrl, deployKey: t.deployKey, code: a.code },
          );
          if (!result.ok) return errorResult(result.error);
          return textResult(
            result.logLines.length > 0
              ? { result: result.value, logLines: result.logLines }
              : { result: result.value },
          );
        }

        case "get_document": {
          const a = getDocumentArgs.parse(JSON.parse(args));
          if (!/^[a-zA-Z0-9_]+$/.test(a.id)) {
            return errorResult("Invalid document ID format.");
          }
          const t = await resolveCreds(ctx, a.repoId, userId, a.environment);
          const result = await ctx.runAction(
            internal.mcp.nodeActions.runTestQuery,
            {
              convexUrl: t.convexUrl,
              deployKey: t.deployKey,
              code: `return await ctx.db.get(${JSON.stringify(a.id)});`,
            },
          );
          if (!result.ok) return errorResult(result.error);
          return textResult(
            result.logLines.length > 0
              ? { document: result.value, logLines: result.logLines }
              : { document: result.value },
          );
        }

        case "count_table": {
          const a = countTableArgs.parse(JSON.parse(args));
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(a.table)) {
            return errorResult("Invalid table name.");
          }
          const t = await resolveCreds(ctx, a.repoId, userId, a.environment);
          const result = await ctx.runAction(
            internal.mcp.nodeActions.runTestQuery,
            {
              convexUrl: t.convexUrl,
              deployKey: t.deployKey,
              code: `const docs = await ctx.db.query(${JSON.stringify(a.table)}).collect(); return docs.length;`,
            },
          );
          if (!result.ok) return errorResult(result.error);
          return textResult({ table: a.table, count: result.value });
        }

        default:
          // Allowed read-only tools not dispatched directly above (Supabase,
          // list_tables) go through eva's MCP server.
          return await callViaMcpServer(ctx, userId, name, args);
      }
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
});
