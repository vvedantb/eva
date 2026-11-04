import { describe, expect, test } from "vitest";
import { z } from "zod";
import { codeModeTools } from "../convex/_mcp/codeModeTools";
import { defineTool } from "../convex/mcp/registry";

// The QuickJS runtime itself (limits, deadline, OOM, call caps, error mapping)
// is tested in @vvedantb/server. These tests cover Eva's wiring around it.
describe("codeModeTools", () => {
  const readTool = defineTool({
    name: "list_widgets",
    description: "List widgets you can reach.\n\nLong second paragraph.",
    mutating: false,
    input: { limit: z.number().default(2) },
    handler: async ({ limit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            widgets: Array.from({ length: limit }, (_, i) => i),
          }),
        },
      ],
    }),
  });
  const failingTool = defineTool({
    name: "delete_widget",
    description: "Delete a widget.",
    mutating: true,
    input: { id: z.string() },
    handler: async ({ id }) => ({
      content: [{ type: "text", text: `No widget ${id}` }],
      isError: true,
    }),
  });
  const [execute, searchTools] = codeModeTools([failingTool, readTool]);

  test("execute dispatches to EvaTool handlers and returns parsed JSON", async () => {
    const result = await execute.invoke(
      JSON.stringify({
        code: `const { widgets } = await tools.list_widgets({ limit: 3 }); return widgets.length;`,
      }),
    );
    expect(result.isError).toBeUndefined();
    const [block] = result.content;
    if (block.type !== "text") throw new Error("expected text");
    expect(JSON.parse(block.text)).toMatchObject({
      result: 3,
      calls: [expect.objectContaining({ name: "list_widgets", ok: true })],
    });
  });

  test("error results and invalid arguments become catchable messages", async () => {
    const result = await execute.invoke(
      JSON.stringify({
        code: `const out = [];
          try { await tools.delete_widget({ id: "w1" }); } catch (e) { out.push(e.message); }
          try { await tools.list_widgets({ limit: "many" }); } catch (e) { out.push(e.message); }
          return out;`,
      }),
    );
    const [block] = result.content;
    if (block.type !== "text") throw new Error("expected text");
    const payload = JSON.parse(block.text);
    expect(payload.result[0]).toBe("No widget w1");
    expect(payload.result[1]).toContain("Invalid arguments for list_widgets");
  });

  test("tools.search and search_tools share the catalog and summarise descriptions", async () => {
    const inScript = await execute.invoke(
      JSON.stringify({
        code: `return (await tools.search({ query: "widget" })).map((t) => t.name);`,
      }),
    );
    const [scriptBlock] = inScript.content;
    if (scriptBlock.type !== "text") throw new Error("expected text");
    expect(JSON.parse(scriptBlock.text).result).toEqual([
      "delete_widget",
      "list_widgets",
    ]);

    const listed = await searchTools.invoke(JSON.stringify({ query: "list" }));
    const [listBlock] = listed.content;
    if (listBlock.type !== "text") throw new Error("expected text");
    const payload = JSON.parse(listBlock.text);
    expect(payload.count).toBe(1);
    expect(payload.tools[0]).toMatchObject({
      name: "list_widgets",
      mutating: false,
      description: "List widgets you can reach.",
    });
    expect(payload.tools[0].inputSchema.properties.limit).toMatchObject({
      type: "number",
      default: 2,
    });
    expect(execute.description).toContain(
      "State-changing tools: delete_widget",
    );
  });

  test("a failed script is an MCP error result and an oversized result becomes a preview", async () => {
    const failed = await execute.invoke(
      JSON.stringify({ code: `return await tools.nope({});` }),
    );
    expect(failed.isError).toBe(true);
    const [failedBlock] = failed.content;
    if (failedBlock.type !== "text") throw new Error("expected text");
    expect(JSON.parse(failedBlock.text).error).toContain("Unknown tool: nope");

    const big = await execute.invoke(
      JSON.stringify({ code: `return "x".repeat(200000);` }),
    );
    expect(big.isError).toBeUndefined();
    const [bigBlock] = big.content;
    if (bigBlock.type !== "text") throw new Error("expected text");
    expect(JSON.parse(bigBlock.text)).toMatchObject({ truncated: true });
  });
});
