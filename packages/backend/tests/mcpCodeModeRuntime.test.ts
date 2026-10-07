import { describe, expect, test } from "vitest";
import { z } from "zod";
import { executeCode, type SandboxTool } from "../convex/_mcp/codeModeRuntime";
import { codeModeTools } from "../convex/_mcp/codeModeTools";
import { defineTool } from "../convex/mcp/registry";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const listEntitiesArgs = z.object({ limit: z.number().default(3) });
const idArgs = z.object({ id: z.string() });

const fakeTools: SandboxTool[] = [
  {
    name: "list_entities",
    mutating: false,
    invoke: async (argsJson) => {
      const { limit } = listEntitiesArgs.parse(JSON.parse(argsJson));
      return JSON.stringify({
        rows: Array.from({ length: limit }, (_, i) => ({
          id: `e${i}`,
          status: i % 2 ? "active" : "closed",
        })),
      });
    },
  },
  {
    name: "get_agent_state",
    mutating: false,
    invoke: async (argsJson) => {
      const { id } = idArgs.parse(JSON.parse(argsJson));
      await wait(5);
      return JSON.stringify({ id, isExecuting: id === "e1" });
    },
  },
  {
    name: "slow",
    mutating: false,
    invoke: async () => {
      await wait(2000);
      return JSON.stringify("late");
    },
  },
  {
    name: "boom",
    mutating: false,
    invoke: async () => {
      throw new Error("handler failed");
    },
  },
  {
    name: "create_task",
    mutating: true,
    invoke: async () => JSON.stringify({ created: true }),
  },
];

const run = (code: string, limits?: Parameters<typeof executeCode>[2]) =>
  executeCode(code, fakeTools, limits);

describe("executeCode", () => {
  test("happy path: parallel tool calls, filtering, logs and call records", async () => {
    const outcome = await run(`
      const { rows } = await tools.list_entities({ limit: 4 });
      const active = rows.filter((r) => r.status === "active");
      const states = await Promise.all(active.map((r) => tools.get_agent_state({ id: r.id })));
      console.log("checked", states.length);
      return states.filter((s) => s.isExecuting).map((s) => s.id);
    `);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toEqual(["e1"]);
    expect(outcome.logs).toEqual(["checked 2"]);
    expect(outcome.calls.map((c) => c.name)).toEqual([
      "list_entities",
      "get_agent_state",
      "get_agent_state",
    ]);
    expect(outcome.calls.every((c) => c.ok)).toBe(true);
  });

  test("a rejected tool call is catchable inside the script", async () => {
    const outcome = await run(
      `try { await tools.boom({}); } catch (e) { return "caught: " + e.message; }`,
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: "caught: handler failed",
    });
    expect(outcome.calls).toEqual([
      expect.objectContaining({ name: "boom", ok: false }),
    ]);
  });

  test("unknown tool names reject with a clear message", async () => {
    const outcome = await run(`return await tools.nope({});`);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("Unknown tool: nope");
  });

  test("an infinite loop is interrupted at the deadline", async () => {
    const outcome = await run(`while (true) {}`, { deadlineMs: 300 });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("interrupted");
  });

  test("a memory bomb hits the heap cap", async () => {
    const outcome = await run(
      `const a = []; while (true) a.push(new Array(1e6).fill(1)); return 1;`,
      { memoryBytes: 16 * 1024 * 1024 },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("out of memory");
  });

  test("host globals are not reachable", async () => {
    const outcome = await run(
      `return { p: typeof process, f: typeof fetch, r: typeof require, s: typeof setTimeout };`,
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        p: "undefined",
        f: "undefined",
        r: "undefined",
        s: "undefined",
      },
    });
  });

  test("syntax errors are reported", async () => {
    const outcome = await run(`return (;`);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("SyntaxError");
  });

  test("a slow tool past the deadline fails cleanly and the module stays healthy", async () => {
    const outcome = await run(`return await tools.slow({});`, {
      deadlineMs: 300,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("exceeded");
    const next = await run(`return 1 + 1;`);
    expect(next).toMatchObject({ ok: true, result: 2 });
  });

  test("the total call cap is enforced", async () => {
    const outcome = await run(
      `let n = 0;
       try { for (let i = 0; i < 100; i++) { await tools.list_entities({ limit: 1 }); n++; } }
       catch (e) { return { n, e: e.message }; }`,
      { maxCalls: 10 },
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: { n: 10, e: "Tool call limit (10) reached" },
    });
  });

  test("the mutating call cap is enforced separately", async () => {
    const outcome = await run(
      `const out = [];
       for (let i = 0; i < 3; i++) {
         try { out.push(await tools.create_task({})); } catch (e) { out.push(e.message); }
       }
       return out;`,
      { maxMutatingCalls: 2 },
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: [
        { created: true },
        { created: true },
        "Mutating tool call limit (2) reached",
      ],
    });
    expect(outcome.calls.filter((c) => c.ok)).toHaveLength(2);
  });

  test("a fire-and-forget rejection does not crash the host", async () => {
    const outcome = await run(`tools.boom({}); return "done";`);
    expect(outcome).toMatchObject({ ok: true, result: "done" });
  });

  test("enumerating tools points at tools.search", async () => {
    const outcome = await run(`return Object.keys(tools);`);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("tools.search");
  });

  test("non-serialisable return values are reported", async () => {
    const outcome = await run(`return { n: 10n };`);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("not JSON-serialisable");
  });
});

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
});
