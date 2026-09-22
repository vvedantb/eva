import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * One Eva MCP tool, described as data rather than as a call into a server.
 *
 * Keeping the definition separate from the mounting lets the same tool be
 * served either as an ordinary MCP tool (flat mode) or through the code-mode
 * `execute` tool, which dispatches by name from sandboxed JavaScript.
 */
export interface EvaTool {
  readonly name: string;
  readonly description: string;
  /** true when the tool creates, changes, sends or stops something; false for pure reads. */
  readonly mutating: boolean;
  /** The zod raw shape of the tool's input, kept for JSON-schema export. */
  readonly inputShape: z.ZodRawShape;
  /** Mounts the tool as an ordinary MCP tool. */
  readonly registerFlat: (server: McpServer) => void;
  /** Parses `argsJson` at the boundary with the tool's own schema and runs the handler. */
  readonly invoke: (argsJson: string) => Promise<CallToolResult>;
}

/**
 * Builds an `EvaTool` from a name, a description, a zod raw shape and a
 * handler typed against that shape. Both mounting paths run the arguments
 * through `z.object(input).parse`, so a handler sees the same validated,
 * defaulted object whichever way it was called.
 */
export function defineTool<Shape extends z.ZodRawShape>(def: {
  name: string;
  description: string;
  mutating: boolean;
  input: Shape;
  handler: (args: z.output<z.ZodObject<Shape>>) => Promise<CallToolResult>;
}): EvaTool {
  const schema = z.object(def.input);
  // Widened so the SDK's generic overload resolves against a plain raw shape.
  // The SDK still validates with the real shape; the parse below re-derives
  // the precise output type for the handler.
  const inputShape: z.ZodRawShape = def.input;
  return {
    name: def.name,
    description: def.description,
    mutating: def.mutating,
    inputShape,
    registerFlat: (server) => {
      server.tool(def.name, def.description, inputShape, (args) =>
        def.handler(schema.parse(args)),
      );
    },
    invoke: (argsJson) => def.handler(schema.parse(JSON.parse(argsJson))),
  };
}

/** Mounts every tool on the server as a flat MCP tool. */
export function mountFlat(server: McpServer, tools: readonly EvaTool[]): void {
  for (const tool of tools) tool.registerFlat(server);
}
