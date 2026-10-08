import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  authQuery,
  authMutation,
  authAction,
  hasTeamAccess,
} from "./functions";
import { artifactFields } from "./validators";
import {
  callerCanSeeChatSource,
  chatSourceArgValidator,
  chatSourceFieldsFromArg,
  chatSourceSummaryValidator,
  listRowsForChatSource,
  resolveChatSource,
  type RepoCache,
} from "./_chatSource/helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Return validators (composed from the single-source-of-truth artifactFields)
// ─────────────────────────────────────────────────────────────────────────────

const artifactDoc = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  ...artifactFields,
  source: chatSourceSummaryValidator,
});

// get() resolves the stored HTML to a (time-limited, signed) storage URL.
const artifactWithUrl = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  ...artifactFields,
  source: chatSourceSummaryValidator,
  url: v.union(v.string(), v.null()),
});

async function withSource(
  ctx: QueryCtx,
  artifact: Doc<"artifacts">,
  repoCache: RepoCache = new Map(),
) {
  return {
    ...artifact,
    source: await resolveChatSource(ctx, artifact, repoCache),
  };
}

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
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
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
    source: v.optional(chatSourceArgValidator),
  },
  returns: v.id("artifacts"),
  handler: async (ctx, args) => {
    if (!(await hasTeamAccess(ctx.db, args.boundTeamId, ctx.userId))) {
      throw new Error("Not authorized: you are not a member of this team.");
    }
    const { source, ...rest } = args;
    return ctx.db.insert("artifacts", {
      ...rest,
      uploadedBy: ctx.userId,
      createdAt: Date.now(),
      ...(await chatSourceFieldsFromArg(ctx, source, "artifact")),
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
      ...(await withSource(ctx, artifact)),
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
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_team", (q) => q.eq("boundTeamId", args.teamId))
      .order("desc")
      .collect();
    const repoCache: RepoCache = new Map();
    return Promise.all(rows.map((row) => withSource(ctx, row, repoCache)));
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
    const repoCache: RepoCache = new Map();
    const rows = await Promise.all(
      perTeam.flat().map((row) => withSource(ctx, row, repoCache)),
    );
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Artifacts created from one session, quick task, or project sandbox. */
export const listForSource = authQuery({
  args: { source: chatSourceArgValidator },
  returns: v.array(artifactDoc),
  handler: async (ctx, args) => {
    if (!(await callerCanSeeChatSource(ctx, args.source))) return [];
    const rows = await listRowsForChatSource(ctx, "artifacts", args.source);
    const visible: Doc<"artifacts">[] = [];
    for (const row of rows) {
      if (await hasTeamAccess(ctx.db, row.boundTeamId, ctx.userId)) {
        visible.push(row);
      }
    }
    const repoCache: RepoCache = new Map();
    return Promise.all(visible.map((row) => withSource(ctx, row, repoCache)));
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
// Every allowed tool except list_repos is forwarded to eva's MCP server as the
// caller (no scopedRepoId), so access, args and error text match mcp/tools.ts.
// Team binding only scopes where the artifact is listed; a call may target any
// repo the caller can reach.
// ─────────────────────────────────────────────────────────────────────────────

// Claude names MCP tools `mcp__<serverId>__<bareName>`. Strip through the last
// "__" (serverIds can themselves contain "__", so lastIndexOf is correct).
function bareToolName(toolName: string): string {
  const idx = toolName.lastIndexOf("__");
  return idx === -1 ? toolName : toolName.slice(idx + 2);
}

// Forwards a read-only tool (Convex data, Postgres, Supabase) to eva's MCP
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
          // Kept direct: artifacts parse this bare-array shape, while the MCP
          // tool now returns `{ repos, groups }` plus repo instructions.
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

        default:
          return await callViaMcpServer(ctx, userId, name, args);
      }
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
});
