"use node";
/**
 * Code mode: the whole Eva tool catalog behind two MCP tools. These two sit
 * beside the flat tools rather than replacing them — `execute` runs
 * model-written JavaScript in the QuickJS sandbox with a `tools` proxy that
 * dispatches to the same `EvaTool` definitions the flat mount exposes one by
 * one; `search_tools` (and `tools.search` inside a script) lets the model find
 * names and schemas without every definition sitting in its context.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { defineTool, type EvaTool } from "../mcp/registry";
import {
  DEFAULT_EXECUTE_LIMITS,
  executeCode,
  type ExecuteOutcome,
  type SandboxTool,
} from "./codeModeRuntime";

/** Serialized `execute` payloads longer than this are cut down to a preview. */
const RESULT_CHAR_CAP = 100_000;

const searchArgs = z.object({ query: z.string().optional() });

/** The first paragraph of a tool description: enough to pick a tool by. */
function summarize(description: string): string {
  const [first] = description.split(/\n\s*\n/);
  return (first ?? description).trim();
}

function searchTools(tools: readonly EvaTool[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tools
    .filter((tool) => {
      const haystack = `${tool.name} ${tool.description}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map((tool) => ({
      name: tool.name,
      mutating: tool.mutating,
      description: summarize(tool.description),
      inputSchema: zodToJsonSchema(z.object(tool.inputShape)),
    }));
}

/**
 * Converts a tool's MCP result into the JSON text a script receives. A single
 * text block that already is JSON passes through untouched, so scripts get
 * objects back from `textResult` tools; anything else becomes a JSON string or
 * the raw content array. Error results become rejections the script can catch.
 */
function resultToJson(result: CallToolResult): string {
  const texts = result.content.flatMap((block) =>
    block.type === "text" ? [block.text] : [],
  );
  if (result.isError) {
    throw new Error(texts.join("\n") || "Tool call failed");
  }
  if (result.content.length === 1 && texts.length === 1) {
    const [text] = texts;
    try {
      JSON.parse(text);
      return text;
    } catch {
      return JSON.stringify(text);
    }
  }
  return JSON.stringify(result.content);
}

function toSandboxTool(tool: EvaTool): SandboxTool {
  return {
    name: tool.name,
    mutating: tool.mutating,
    invoke: async (argsJson) => {
      try {
        return resultToJson(await tool.invoke(argsJson));
      } catch (err) {
        if (err instanceof z.ZodError) {
          const issues = err.issues
            .map(
              (issue) =>
                `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            )
            .join("; ");
          throw new Error(`Invalid arguments for ${tool.name}: ${issues}`);
        }
        throw err;
      }
    },
  };
}

function text(value: string, isError: boolean): CallToolResult {
  return isError
    ? { content: [{ type: "text", text: value }], isError: true }
    : { content: [{ type: "text", text: value }] };
}

/** Serializes an outcome, replacing an oversized result with a preview. */
function serializeOutcome(outcome: ExecuteOutcome): string {
  const base = { logs: outcome.logs, calls: outcome.calls, ms: outcome.ms };
  const full = JSON.stringify(
    outcome.ok
      ? { result: outcome.result, ...base }
      : { error: outcome.error, ...base },
    null,
    2,
  );
  if (full.length <= RESULT_CHAR_CAP || !outcome.ok) return full;
  const preview = JSON.stringify(outcome.result);
  return JSON.stringify(
    {
      truncated: true,
      note: `Result was ${preview.length} characters; showing the first ${RESULT_CHAR_CAP}. Filter or summarise inside the script instead.`,
      resultPreview: `${preview.slice(0, RESULT_CHAR_CAP)}…`,
      ...base,
    },
    null,
    2,
  );
}

function executeDescription(tools: readonly EvaTool[]): string {
  const names = (mutating: boolean) =>
    tools
      .filter((tool) => tool.mutating === mutating)
      .map((tool) => tool.name)
      .join(", ");
  const limits = DEFAULT_EXECUTE_LIMITS;
  return [
    "Run JavaScript against Eva's tools in a sandbox and get the result back in one round trip. Use it to chain calls, loop over entities, filter or aggregate data before it reaches you, or run several reads in parallel with Promise.all.",
    "",
    "Every tool below is also exposed directly as an MCP tool. Prefer a direct call for one simple read; use execute when a task needs several calls, a loop, filtering, or aggregation.",
    "",
    "`code` is the body of an async function. Inside it:",
    "- `await tools.<name>({ ...args })` calls a tool and resolves to its parsed JSON result (a string for plain-text tools). Failures throw an Error carrying the tool's message, so try/catch works.",
    "- `await tools.search({ query })` returns matching tools as { name, description, mutating, inputSchema }. An empty query lists every tool.",
    "- `console.log(...)` lines come back as `logs`.",
    "- `return` a JSON-serialisable value; it comes back as `result`.",
    "",
    `No fetch, imports, timers or filesystem. Limits per run: ${Math.round(limits.deadlineMs / 1000)}s wall clock, ${limits.maxCalls} tool calls of which at most ${limits.maxMutatingCalls} may change state, ${Math.round(limits.memoryBytes / 1024 / 1024)} MB heap. The reply lists every tool call made (name, ms, ok).`,
    "",
    `Read-only tools: ${names(false)}.`,
    `State-changing tools: ${names(true)}.`,
  ].join("\n");
}

/** Builds the two code-mode tools over the given catalog. */
export function codeModeTools(tools: readonly EvaTool[]): EvaTool[] {
  const catalog = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  const searchTool: SandboxTool = {
    name: "search",
    mutating: false,
    invoke: async (argsJson) => {
      const { query } = searchArgs.parse(JSON.parse(argsJson));
      return JSON.stringify(searchTools(catalog, query ?? ""));
    },
  };
  const sandboxTools = [searchTool, ...catalog.map(toSandboxTool)];

  return [
    defineTool({
      name: "execute",
      description: executeDescription(catalog),
      // Scripts may call state-changing tools, so the wrapper counts as one.
      mutating: true,
      input: {
        code: z
          .string()
          .trim()
          .min(1)
          .describe(
            "JavaScript: the body of an async function. Use `await tools.<name>(args)`, `console.log`, and `return`.",
          ),
      },
      handler: async ({ code }) => {
        const outcome = await executeCode(code, sandboxTools);
        return text(serializeOutcome(outcome), !outcome.ok);
      },
    }),
    defineTool({
      name: "search_tools",
      description:
        "Find Eva tools to call from `execute`. Returns each match's name, a one-paragraph description, whether it changes state, and its JSON input schema. Omit the query to list every tool.",
      mutating: false,
      input: {
        query: z
          .string()
          .optional()
          .describe(
            "Words that must all appear in the tool's name or description. Omit to list everything.",
          ),
      },
      handler: async ({ query }) => {
        const matches = searchTools(catalog, query ?? "");
        return text(
          JSON.stringify({ tools: matches, count: matches.length }, null, 2),
          false,
        );
      },
    }),
  ];
}
