import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { codeModeTools } from "../convex/_mcp/codeModeTools";
import {
  EVALUATE_MODEL,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MAX_STATE_CHARS,
  evaluateInput,
  evaluateInputShape,
  evaluateTool,
  type EvaluateInput,
  type EvaluateOutcome,
} from "../convex/_mcp/evaluateTool";

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const convexSource = (relative: string) =>
  readFileSync(join(convexDir, relative), "utf8");

const booleanQ = {
  type: "boolean",
  instructions: "Is this a bug fix?",
} as const;
const choiceQ = {
  type: "choice",
  instructions: "Which area?",
  criteria: { frontend: null, backend: "server code", infra: null },
} as const;
const scoreQ = {
  type: "score",
  instructions: "How severe?",
  criteria: ["cosmetic", "minor", "major", "critical"],
} as const;

/** Shape of the JSON block the tool returns on success. */
const toolPayload = z.object({
  model: z.string(),
  answers: z.record(
    z.string(),
    z.object({
      type: z.string(),
      probability: z.number().optional(),
      choice: z.string().optional(),
      score: z.number().optional(),
    }),
  ),
  usage: z.object({ totalTokens: z.number().nullable() }),
  warnings: z.array(z.string()).optional(),
  metadata: z
    .object({ typesafe: z.object({ confidence: z.record(z.number()) }) })
    .optional(),
});

/** Shape of an `execute` result block. */
const executePayload = z.object({
  result: z.union([z.array(z.number()), z.string()]),
  calls: z.array(z.object({ name: z.string(), ok: z.boolean() })),
});

const manyOptions = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`o${index}`, null]),
  );

describe("evaluate input schema", () => {
  test("accepts every question type with string state", () => {
    const parsed = evaluateInput.safeParse({
      state: "fix: null deref in checkout",
      questions: { isBug: booleanQ, area: choiceQ, severity: scoreQ },
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts boolean criteria with only the true case, rejects foreign keys", () => {
    expect(
      evaluateInput.safeParse({
        state: "x",
        questions: {
          q: { ...booleanQ, criteria: { true: "explicit fix wording" } },
        },
      }).success,
    ).toBe(true);
    expect(
      evaluateInput.safeParse({
        state: "x",
        questions: { q: { ...booleanQ, criteria: { maybe: "?" } } },
      }).success,
    ).toBe(false);
  });

  test("accepts JSON object and array state, rejects numbers and empty strings", () => {
    const questions = { q: booleanQ };
    expect(
      evaluateInput.safeParse({
        state: { title: "t", labels: ["a"] },
        questions,
      }).success,
    ).toBe(true);
    expect(
      evaluateInput.safeParse({ state: ["one", { two: 2 }], questions })
        .success,
    ).toBe(true);
    expect(evaluateInput.safeParse({ state: 42, questions }).success).toBe(
      false,
    );
    expect(evaluateInput.safeParse({ state: "", questions }).success).toBe(
      false,
    );
  });

  test("enforces choice option and score level bounds", () => {
    const state = "x";
    expect(
      evaluateInput.safeParse({
        state,
        questions: { q: { ...choiceQ, criteria: {} } },
      }).success,
    ).toBe(false);
    expect(
      evaluateInput.safeParse({
        state,
        questions: { q: { ...choiceQ, criteria: manyOptions(MAX_OPTIONS) } },
      }).success,
    ).toBe(true);
    expect(
      evaluateInput.safeParse({
        state,
        questions: {
          q: { ...choiceQ, criteria: manyOptions(MAX_OPTIONS + 1) },
        },
      }).success,
    ).toBe(false);
    expect(
      evaluateInput.safeParse({
        state,
        questions: { q: { ...scoreQ, criteria: ["only one"] } },
      }).success,
    ).toBe(false);
    expect(
      evaluateInput.safeParse({
        state,
        questions: {
          q: {
            ...scoreQ,
            criteria: Array.from({ length: MAX_OPTIONS + 1 }, () => null),
          },
        },
      }).success,
    ).toBe(false);
  });

  test("enforces question count and id grammar", () => {
    expect(evaluateInput.safeParse({ state: "x", questions: {} }).success).toBe(
      false,
    );
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_QUESTIONS + 1 }, (_, index) => [
        `q${index}`,
        booleanQ,
      ]),
    );
    expect(
      evaluateInput.safeParse({ state: "x", questions: tooMany }).success,
    ).toBe(false);
    expect(
      evaluateInput.safeParse({
        state: "x",
        questions: { "has space": booleanQ },
      }).success,
    ).toBe(false);
  });

  test("caps serialised state size", () => {
    const parsed = evaluateInput.safeParse({
      state: "x".repeat(MAX_STATE_CHARS + 1),
      questions: { q: booleanQ },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["state"]);
    }
  });

  test("exports a described JSON schema for search_tools", () => {
    const schema = zodToJsonSchema(z.object(evaluateInputShape));
    const json = JSON.stringify(schema);
    expect(json).toContain('"state"');
    expect(json).toContain('"questions"');
    expect(json).toContain("Question id -> question");
  });
});

const okOutcome = (model = EVALUATE_MODEL): EvaluateOutcome => ({
  ok: true,
  model,
  answers: {
    isBug: { type: "boolean", probability: 0.91 },
    area: {
      type: "choice",
      choice: "backend",
      probabilities: { frontend: 0.05, backend: 0.9, infra: 0.05 },
    },
    severity: { type: "score", score: 2.1 },
  },
  usage: { inputTokens: 120, outputTokens: 0, totalTokens: 120 },
  warnings: [],
  metadata: { typesafe: { confidence: { area: 0.88 } } },
});

describe("evaluate tool", () => {
  test("is a read-only tool named evaluate", () => {
    const tool = evaluateTool(async () => okOutcome());
    expect(tool.name).toBe("evaluate");
    expect(tool.mutating).toBe(false);
  });

  test("returns one JSON block with model, answers, usage and metadata", async () => {
    const seen: EvaluateInput[] = [];
    const tool = evaluateTool(async (input) => {
      seen.push(input);
      return okOutcome();
    });
    const result = await tool.invoke(
      JSON.stringify({
        state: "fix: null deref",
        questions: { isBug: booleanQ, area: choiceQ, severity: scoreQ },
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const [block] = result.content;
    if (block?.type !== "text") throw new Error("expected a text block");
    const payload = toolPayload.parse(JSON.parse(block.text));
    expect(payload.model).toBe(EVALUATE_MODEL);
    expect(payload.answers.area?.choice).toBe("backend");
    expect(payload.usage.totalTokens).toBe(120);
    expect(payload.metadata?.typesafe.confidence.area).toBe(0.88);
    expect(payload.warnings).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.state).toBe("fix: null deref");
  });

  test("rejects bad shapes at the boundary and caps as an error result", async () => {
    let calls = 0;
    const tool = evaluateTool(async () => {
      calls += 1;
      return okOutcome();
    });
    // The registry parses the raw shape before the handler runs, so a bad
    // shape — including the per-question option cap — throws synchronously.
    expect(() =>
      tool.invoke(JSON.stringify({ state: 42, questions: { q: booleanQ } })),
    ).toThrow(z.ZodError);
    expect(() =>
      tool.invoke(
        JSON.stringify({
          state: "x",
          questions: {
            q: { ...choiceQ, criteria: manyOptions(MAX_OPTIONS + 1) },
          },
        }),
      ),
    ).toThrow(z.ZodError);
    // Cross-field caps live in the handler and come back as a tool error.
    const capped = await tool.invoke(
      JSON.stringify({
        state: "x".repeat(MAX_STATE_CHARS + 1),
        questions: { q: booleanQ },
      }),
    );
    expect(capped.isError).toBe(true);
    const [block] = capped.content;
    if (block?.type !== "text") throw new Error("expected a text block");
    expect(block.text).toContain("Invalid evaluate input: state:");
    expect(calls).toBe(0);
  });

  test("maps failure outcomes to agent-facing error results", async () => {
    const tool = evaluateTool(async () => ({
      ok: false,
      errorCode: "missing_config",
      error: "AI_GATEWAY_API_KEY is not set on this Convex deployment.",
      retryable: false,
    }));
    const result = await tool.invoke(
      JSON.stringify({ state: "x", questions: { q: booleanQ } }),
    );
    expect(result.isError).toBe(true);
    const [block] = result.content;
    if (block?.type !== "text") throw new Error("expected a text block");
    expect(block.text).toContain("AI_GATEWAY_API_KEY");
  });
});

describe("evaluate inside execute", () => {
  test("loops over items with a constant questions object", async () => {
    const states: EvaluateInput["state"][] = [];
    const tool = evaluateTool(async (input) => {
      states.push(input.state);
      return okOutcome();
    });
    const execute = codeModeTools([tool]).find((t) => t.name === "execute");
    if (!execute) throw new Error("execute tool missing");
    const code = `
      const questions = ${JSON.stringify({ isBug: booleanQ })};
      const items = ["a", "b", "c"];
      const out = [];
      for (const item of items) {
        const r = await tools.evaluate({ state: item, questions });
        out.push(r.answers.isBug.probability);
      }
      return out;
    `;
    const result = await execute.invoke(JSON.stringify({ code }));
    expect(result.isError).toBeUndefined();
    const [block] = result.content;
    if (block?.type !== "text") throw new Error("expected a text block");
    const payload = executePayload.parse(JSON.parse(block.text));
    expect(payload.result).toEqual([0.91, 0.91, 0.91]);
    expect(payload.calls).toHaveLength(3);
    expect(
      payload.calls.every((call) => call.name === "evaluate" && call.ok),
    ).toBe(true);
    expect(states).toEqual(["a", "b", "c"]);
  });

  test("surfaces failures as catchable errors in scripts", async () => {
    const tool = evaluateTool(async () => ({
      ok: false,
      errorCode: "missing_config",
      error: "AI_GATEWAY_API_KEY is not set on this Convex deployment.",
      retryable: false,
    }));
    const execute = codeModeTools([tool]).find((t) => t.name === "execute");
    if (!execute) throw new Error("execute tool missing");
    const code = `
      try {
        await tools.evaluate({ state: "x", questions: { q: { type: "boolean", instructions: "?" } } });
        return "unexpected";
      } catch (err) {
        return err.message;
      }
    `;
    const result = await execute.invoke(JSON.stringify({ code }));
    const [block] = result.content;
    if (block?.type !== "text") throw new Error("expected a text block");
    const payload = executePayload.parse(JSON.parse(block.text));
    expect(payload.result).toContain("AI_GATEWAY_API_KEY");
  });
});

describe("evaluate wiring contract", () => {
  test("is registered for every caller and calls the gateway with ZDR", () => {
    const tools = convexSource("mcp/tools.ts");
    const registration = tools.indexOf("evaluateTool(");
    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(tools.indexOf("if (isOrchestrator) {"));

    const action = convexSource("mcp/evaluate.ts");
    expect(action.startsWith('"use node";')).toBe(true);
    expect(action).toContain("evaluateDecision(");
    expect(action).toContain('"eva-mcp-evaluate"');

    // The one place the gateway is called, for every Jev caller.
    const client = convexSource("_jev/client.ts");
    expect(client.startsWith('"use node";')).toBe(true);
    expect(client).toContain("experimental_evaluate");
    expect(client).toContain("zeroDataRetention: true");
    expect(client).toContain("AI_GATEWAY_API_KEY");
    expect(client).toContain("tags: [options.tag]");
    expect(client).not.toContain("TYPESAFE_API_KEY");

    expect(convexSource("_jev/schema.ts")).toContain(
      `EVALUATE_MODEL = "typesafe-ai/jev"`,
    );
    expect(convexSource("_mcp/evaluateTool.ts")).toContain("mutating: false");
  });
});
