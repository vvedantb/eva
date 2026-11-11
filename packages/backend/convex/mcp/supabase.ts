import { toolErrorResult, errorMessage } from "@vvedantb/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ZodTypeAny } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { defineTool, type EvaTool } from "./registry";
import { entityAccess, repoRefArgs, type RepoRef } from "./entityRef";
import {
  mcpGetContext,
  mcpListUserRepos,
  type McpCredentials,
} from "./toolShared";

const SUPABASE_PREFIX = "supabase_";
const TOOL_CACHE_TTL_MS = 10 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 30_000;

const SUPABASE_REMOTE_URL = "https://mcp.supabase.com/mcp?read_only=true";
const READ_ONLY_SUPABASE_TOOLS = new Set([
  "execute_sql",
  "generate_typescript_types",
  "get_advisors",
  "get_anon_key",
  "get_logs",
  "get_project",
  "get_project_url",
  "list_edge_functions",
  "list_extensions",
  "list_migrations",
  "list_tables",
  "search_docs",
]);

/** Tools with no project argument. Every other tool must take `project_id`. */
const PROJECT_FREE_TOOLS = new Set(["search_docs"]);

/**
 * The repo's allowed Supabase project refs: `SUPABASE_PROJECT_ID` (one ref or
 * a comma-separated list, e.g. staging and prod), else the subdomain of
 * `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` (`<ref>.supabase.co`).
 */
export function supabaseProjectRefs(
  vars: Array<{ key: string; value: string }>,
): string[] {
  const value = (key: string) =>
    vars.find((entry) => entry.key === key)?.value.trim();
  const explicit = (value("SUPABASE_PROJECT_ID") ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);
  if (explicit.length > 0) return [...new Set(explicit)];
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    let hostname: string;
    try {
      hostname = new URL(value(key) ?? "").hostname;
    } catch {
      continue;
    }
    const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(hostname)?.[1];
    if (ref) return [ref];
  }
  return [];
}

/**
 * Keeps a tool call on one of the repo's projects. With one project,
 * `project_id` may be omitted; with several, the caller must pick one. Any
 * other project is rejected rather than silently rewritten.
 */
export function bindSupabaseProject(
  args: Record<string, unknown>,
  projectRefs: readonly string[],
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const allowed = projectRefs.join(", ");
  const requested = args.project_id;
  if (requested === undefined) {
    const [only] = projectRefs;
    if (projectRefs.length === 1 && only !== undefined) {
      return { ok: true, args: { ...args, project_id: only } };
    }
    return {
      ok: false,
      error: `This repo has several Supabase projects. Pass project_id as one of: ${allowed}.`,
    };
  }
  if (typeof requested !== "string" || !projectRefs.includes(requested)) {
    return {
      ok: false,
      error: `project_id must be one of this repo's Supabase projects: ${allowed}.`,
    };
  }
  return { ok: true, args };
}

// In-memory cache (reset on action cold starts)
const toolDefinitionCache = new Map<
  string,
  { tools: Tool[]; expiresAt: number }
>();

const jsonSchemaPropertySchema = z
  .object({
    type: z.string().optional(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
  })
  .passthrough();

const toolResultContentSchema = z.object({ content: z.array(z.unknown()) });
const textContentItemSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
const toolResultErrorSchema = z.object({ isError: z.literal(true) });

function toZodType(raw: unknown): ZodTypeAny {
  const parsed = jsonSchemaPropertySchema.safeParse(raw);
  if (!parsed.success) return z.string();

  const prop = parsed.data;

  if (prop.enum && prop.enum.length > 0) {
    const zodEnum = z.enum([prop.enum[0], ...prop.enum.slice(1)]);
    return prop.description ? zodEnum.describe(prop.description) : zodEnum;
  }

  let base: ZodTypeAny;
  switch (prop.type) {
    case "number":
    case "integer":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      base = z.array(z.unknown());
      break;
    case "object":
      base = z.record(z.string(), z.unknown());
      break;
    default:
      base = z.string();
      break;
  }
  return prop.description ? base.describe(prop.description) : base;
}

function toolSchemaToZodShape(
  inputSchema: Tool["inputSchema"],
): Record<string, ZodTypeAny> {
  const shape: Record<string, ZodTypeAny> = {};
  const required = new Set(inputSchema.required ?? []);
  for (const [key, raw] of Object.entries(inputSchema.properties ?? {})) {
    const zodType = toZodType(raw);
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }
  return shape;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function createTransport(token: string): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(SUPABASE_REMOTE_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function connectClient(token: string): Promise<Client> {
  const transport = createTransport(token);
  const client = new Client({ name: "eva-supabase-proxy", version: "1.0.0" });
  try {
    await withTimeout(
      client.connect(transport),
      CONNECT_TIMEOUT_MS,
      "Supabase MCP connect",
    );
  } catch (err) {
    await client.close().catch(() => {});
    throw err;
  }
  return client;
}

async function discoverTools(token: string): Promise<Tool[]> {
  const cached = toolDefinitionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tools;
  }

  const client = await connectClient(token);
  try {
    const result = await withTimeout(
      client.listTools(),
      CONNECT_TIMEOUT_MS,
      "Supabase tools/list",
    );
    toolDefinitionCache.set(token, {
      tools: result.tools,
      expiresAt: Date.now() + TOOL_CACHE_TTL_MS,
    });
    return result.tools;
  } finally {
    await client.close();
  }
}

type SupabaseCredentials = { token: string; projectRefs: string[] };

/** Per user: the repo whose token lists Supabase's tools (null = none). */
const discoveryRepoCache = new Map<
  string,
  { repoId: string | null; expiresAt: number }
>();

function resolveCredentials(
  ctx: ActionCtx,
  repoId: string,
): Promise<SupabaseCredentials | null> {
  return ctx.runAction(internal.mcp.nodeActions.resolveSupabaseCredentials, {
    repoId,
  });
}

/**
 * Credentials used only to list Supabase's tool definitions (names and input
 * schemas, no data). A sandbox uses its own repo. A user-level connection
 * (claude.ai) uses the first repo it can reach that has Supabase configured;
 * every call still runs on the repo the caller names.
 */
async function discoveryCredentials(
  ctx: ActionCtx,
  credentials: McpCredentials,
): Promise<SupabaseCredentials | null> {
  if (credentials.scopedRepoId !== undefined) {
    return resolveCredentials(ctx, credentials.scopedRepoId);
  }
  const { clerkUserId } = credentials;
  const cached = discoveryRepoCache.get(clerkUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.repoId === null
      ? null
      : resolveCredentials(ctx, cached.repoId);
  }
  const { userId } = await mcpGetContext(ctx, clerkUserId);
  const repos = await mcpListUserRepos(ctx, userId);
  // Sequential on purpose: stop at the first configured repo instead of
  // decrypting every repo's env vars.
  for (const repo of repos) {
    const found = await resolveCredentials(ctx, repo.id);
    if (found) {
      discoveryRepoCache.set(clerkUserId, {
        repoId: repo.id,
        expiresAt: Date.now() + TOOL_CACHE_TTL_MS,
      });
      return found;
    }
  }
  discoveryRepoCache.set(clerkUserId, {
    repoId: null,
    expiresAt: Date.now() + TOOL_CACHE_TTL_MS,
  });
  return null;
}

const repoRefSchema = z.object(repoRefArgs);

export async function supabaseTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): Promise<EvaTool[]> {
  const { scopedRepoId } = credentials;
  const { assertRepoAccess, resolveRepoRef } = entityAccess(ctx, credentials);

  /**
   * The repo a call runs against: the one the caller names, else the
   * sandbox's own repo. Same access check as postgres_query, including the
   * sandbox token's single-repo pin.
   */
  async function targetRepo(
    ref: RepoRef,
  ): Promise<{ repoId: string } | ReturnType<typeof toolErrorResult>> {
    if (!ref.repoId && !ref.repoName) {
      if (scopedRepoId !== undefined) return { repoId: scopedRepoId };
      return toolErrorResult(
        "Provide repoId (from list_repos) or repoName for the repo whose Supabase project to use.",
      );
    }
    const { userId } = await mcpGetContext(ctx, credentials.clerkUserId);
    const resolved = await resolveRepoRef(ref, userId);
    if ("content" in resolved) return resolved;
    await assertRepoAccess(resolved.repoId, userId);
    return resolved;
  }

  let discovery: SupabaseCredentials | null;
  try {
    discovery = await discoveryCredentials(ctx, credentials);
  } catch (err) {
    console.error("Supabase: failed to resolve credentials:", err);
    return [];
  }

  if (!discovery) {
    console.log(
      "Supabase: no repo with SUPABASE_ACCESS_TOKEN plus SUPABASE_PROJECT_ID/SUPABASE_URL, skipping",
    );
    return [];
  }

  let tools: Tool[];
  try {
    tools = await discoverTools(discovery.token);
  } catch (err) {
    console.error("Supabase: failed to discover tools:", err);
    return [];
  }

  if (tools.length === 0) {
    console.log("Supabase: no tools discovered");
    return [];
  }

  const visibleTools = tools.filter(
    (tool) =>
      READ_ONLY_SUPABASE_TOOLS.has(tool.name) &&
      (PROJECT_FREE_TOOLS.has(tool.name) ||
        "project_id" in (tool.inputSchema.properties ?? {})),
  );

  if (visibleTools.length === 0) {
    console.log("Supabase: no allowed read-only tools discovered");
    return [];
  }

  const evaTools: EvaTool[] = [];
  for (const tool of visibleTools) {
    const prefixedName = `${SUPABASE_PREFIX}${tool.name}`;
    const bindsProject = !PROJECT_FREE_TOOLS.has(tool.name);
    const zodShape = toolSchemaToZodShape(tool.inputSchema);
    if (bindsProject) {
      zodShape.project_id = z
        .string()
        .optional()
        .describe(
          scopedRepoId === undefined
            ? "One of the named repo's Supabase projects (its SUPABASE_PROJECT_ID list). May be omitted when the repo has one; otherwise the error lists the allowed refs. supabase_get_project shows each ref's name."
            : `One of this repo's Supabase projects: ${discovery.projectRefs.join(", ")}. May be omitted when there is only one.`,
        );
    }

    evaTools.push(
      defineTool({
        name: prefixedName,
        description: `[Supabase] ${tool.description ?? tool.name}`,
        mutating: false,
        input: { ...zodShape, ...repoRefArgs },
        handler: async (input: Record<string, unknown>) => {
          const { repoId: _repoId, repoName: _repoName, app: _app, ...args } =
            input;
          const target = await targetRepo(repoRefSchema.parse(input));
          if ("content" in target) return target;
          // Re-resolve in case the token expired or the env changed.
          const current = await resolveCredentials(ctx, target.repoId);
          if (!current) {
            return toolErrorResult(
              "This repo has no SUPABASE_ACCESS_TOKEN plus SUPABASE_PROJECT_ID or SUPABASE_URL in Eva.",
            );
          }
          let callArgs = args;
          if (bindsProject) {
            const bound = bindSupabaseProject(args, current.projectRefs);
            if (!bound.ok) return toolErrorResult(bound.error);
            callArgs = bound.args;
          }
          const currentToken = current.token;

          try {
            const client = await connectClient(currentToken);
            try {
              const result = await withTimeout(
                client.callTool({ name: tool.name, arguments: callArgs }),
                CALL_TIMEOUT_MS,
                `Supabase tool ${tool.name}`,
              );

              const parsedResult = toolResultContentSchema.safeParse(result);
              if (!parsedResult.success) {
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: JSON.stringify(result),
                    },
                  ],
                };
              }

              const textContent = parsedResult.data.content.flatMap((item) => {
                const parsedItem = textContentItemSchema.safeParse(item);
                return parsedItem.success ? [parsedItem.data] : [];
              });

              return {
                content:
                  textContent.length > 0
                    ? textContent
                    : [
                        {
                          type: "text" as const,
                          text: JSON.stringify(parsedResult.data.content),
                        },
                      ],
                isError: toolResultErrorSchema.safeParse(result).success
                  ? true
                  : undefined,
              };
            } finally {
              await client.close();
            }
          } catch (err) {
            const message = errorMessage(err);
            return toolErrorResult(`Supabase tool error: ${message}`);
          }
        },
      }),
    );
  }

  return evaTools;
}
