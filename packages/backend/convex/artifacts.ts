import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import {
  internalMutation,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertMessageParentAccess,
  authQuery,
  authMutation,
  authAction,
  hasTeamAccess,
} from "./functions";
import { artifactFields, messageFields } from "./validators";
import { latestChatMessageId, resolveChatParent } from "./_chat/chatParent";
import { chatEntityKindValidator } from "./_validators/enums";
import { deleteAllArtifactState } from "./artifactState";
import {
  callerCanSeeChatSource,
  chatSourceArgValidator,
  chatSourceFieldsFromArg,
  chatSourceSummaryValidator,
  listRowsForChatRollUp,
  resolveChatSource,
  type RepoCache,
} from "./_chatSource/helpers";
import { errorMessage } from "@vvedantb/server";

const artifactDoc = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  ...artifactFields,
  source: chatSourceSummaryValidator,
});

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

/** Temporary upload URL for the artifact HTML (client POSTs the file, then calls create). */
export const generateUploadUrl = authMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

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

/**
 * Artifacts created from one session, quick task, or project sandbox. A
 * project rolls up its child tasks' artifacts (`listRowsForChatRollUp`).
 */
export const listForSource = authQuery({
  args: { source: chatSourceArgValidator },
  returns: v.array(artifactDoc),
  handler: async (ctx, args) => {
    if (!(await callerCanSeeChatSource(ctx, args.source))) return [];
    const rows = await listRowsForChatRollUp(ctx, "artifacts", args.source);
    const access = await Promise.all(
      rows.map((row) => hasTeamAccess(ctx.db, row.boundTeamId, ctx.userId)),
    );
    const visible = rows.filter((_row, i) => access[i]);
    const repoCache: RepoCache = new Map();
    return Promise.all(visible.map((row) => withSource(ctx, row, repoCache)));
  },
});

/**
 * Anchors a new artifact to the chat turn that created it, so it shows as an
 * inline card under that reply. Called by `create_artifact` after the row
 * exists; the same anchor rule as `render_html` (`latestChatMessageId`).
 */
export const anchorToChat = internalMutation({
  args: {
    artifactId: v.string(),
    entityKind: chatEntityKindValidator,
    entityId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const artifactId = ctx.db.normalizeId("artifacts", args.artifactId);
    if (!artifactId) return null;
    const chatParentId = await resolveChatParent(
      ctx.db,
      args.entityKind,
      args.entityId,
    );
    if (!chatParentId) return null;
    const messageId = await latestChatMessageId(ctx.db, chatParentId);
    await ctx.db.patch(artifactId, {
      chatParentId,
      ...(messageId ? { messageId } : {}),
    });
    return null;
  },
});

/**
 * The artifacts created in one chat thread, for its inline cards. Light rows
 * only: a card loads the HTML when the user opens its preview.
 */
export const listForChat = authQuery({
  args: { parentId: messageFields.parentId },
  returns: v.array(
    v.object({
      _id: v.id("artifacts"),
      name: v.string(),
      description: v.optional(v.string()),
      messageId: v.optional(v.id("messages")),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await assertMessageParentAccess(ctx.db, args.parentId, ctx.userId);
    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_chat_parent", (q) => q.eq("chatParentId", args.parentId))
      .collect();
    const access = await Promise.all(
      rows.map((row) => hasTeamAccess(ctx.db, row.boundTeamId, ctx.userId)),
    );
    const visible = [];
    for (const [i, row] of rows.entries()) {
      if (!access[i]) continue;
      visible.push({
        _id: row._id,
        name: row.name,
        ...(row.description !== undefined
          ? { description: row.description }
          : {}),
        ...(row.messageId !== undefined ? { messageId: row.messageId } : {}),
        createdAt: row.createdAt,
      });
    }
    return visible;
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
    await deleteAllArtifactState(ctx, args.id);
    await ctx.db.delete(args.id);
    return null;
  },
});

function bareToolName(toolName: string): string {
  const idx = toolName.lastIndexOf("__");
  return idx === -1 ? toolName : toolName.slice(idx + 2);
}

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
          const repos: Array<{
            id: string;
            owner: string;
            name: string;
            rootDirectory: string | null;
            mcpRootPrompt: string | null;
          }> = await ctx.runQuery(internal.mcp.queries.listUserRepos, {
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
      return errorResult(errorMessage(err));
    }
  },
});
