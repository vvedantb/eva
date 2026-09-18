import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ZodTypeAny } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { errorResult } from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

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
  "list_projects",
  "list_tables",
  "search_docs",
]);

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

interface McpCredentials {
  clerkUserId: string;
  scopedRepoId?: string;
}

export async function supabaseTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): Promise<EvaTool[]> {
  const { clerkUserId } = credentials;

  // Try to resolve Supabase token
  let token: string | null;
  try {
    token = await ctx.runAction(internal.mcp.nodeActions.resolveSupabaseToken, {
      clerkUserId,
    });
  } catch (err) {
    console.error("Supabase: failed to resolve token:", err);
    return [];
  }

  if (!token) {
    console.log("Supabase: no SUPABASE_ACCESS_TOKEN found, skipping");
    return [];
  }

  let tools: Tool[];
  try {
    tools = await discoverTools(token);
  } catch (err) {
    console.error("Supabase: failed to discover tools:", err);
    return [];
  }

  if (tools.length === 0) {
    console.log("Supabase: no tools discovered");
    return [];
  }

  const visibleTools = tools.filter((tool) =>
    READ_ONLY_SUPABASE_TOOLS.has(tool.name),
  );

  if (visibleTools.length === 0) {
    console.log("Supabase: no allowed read-only tools discovered");
    return [];
  }

  const evaTools: EvaTool[] = [];
  for (const tool of visibleTools) {
    const prefixedName = `${SUPABASE_PREFIX}${tool.name}`;
    const zodShape = toolSchemaToZodShape(tool.inputSchema);

    evaTools.push(
      defineTool({
        name: prefixedName,
        description: `[Supabase] ${tool.description ?? tool.name}`,
        mutating: false,
        input: zodShape,
        handler: async (args: Record<string, unknown>) => {
          // Re-resolve token in case it expired
          const currentToken = await ctx.runAction(
            internal.mcp.nodeActions.resolveSupabaseToken,
            { clerkUserId },
          );
          if (!currentToken) {
            return errorResult("SUPABASE_ACCESS_TOKEN is no longer available.");
          }

          try {
            const client = await connectClient(currentToken);
            try {
              const result = await withTimeout(
                client.callTool({ name: tool.name, arguments: args }),
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
            const message = err instanceof Error ? err.message : String(err);
            return errorResult(`Supabase tool error: ${message}`);
          }
        },
      }),
    );
  }

  return evaTools;
}
