import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { tryParseJsonObject } from "../utils.js";

// PROVIDER picks the stream format extractResultEvent reads; set per test.
// Bun copies a mocked module's exports once, so re-mock on every change.
const originalConfig = { ...(await import("../config.js")) };
function setProvider(provider: string): void {
  mock.module("../config.js", () => ({
    ...originalConfig,
    PROVIDER: provider,
    normalizedCursorModel: "composer-2",
    normalizedOpencodeModel: "anthropic/claude-sonnet-4",
  }));
}
setProvider("");

const { extractResultEvent } = await import("../runtime/completion.js");

afterEach(() => {
  setProvider("");
});

function lines(...events: object[]): string {
  return events.map((event) => JSON.stringify(event) + "\n").join("");
}

function assistantText(text: string): object {
  return { type: "assistant", message: { content: [{ type: "text", text }] } };
}

/**
 * Cursor and OpenCode runners end each turn with a synthetic `{type:"result"}`
 * line; completion reads it and reports a Claude-shaped result event so the
 * server bills and stores every provider the same way.
 */
describe("Cursor and OpenCode synthetic results", () => {
  test("a Cursor run reports its result and usage under the configured model", () => {
    setProvider("cursor");
    const output = readFileSync(
      join(import.meta.dirname, "fixtures", "cursor-sdk-events.jsonl"),
      "utf8",
    );

    const event = extractResultEvent(output);

    expect(event).toMatchObject({ result: "Done.", isError: false });
    expect(tryParseJsonObject(event?.rawResultEvent ?? "")).toEqual({
      type: "result",
      provider: "cursor",
      total_cost_usd: 0,
      duration_ms: 4200,
      usage: {
        input_tokens: 1200,
        output_tokens: 300,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
      },
      modelUsage: { "composer-2": {} },
    });
  });

  test("an OpenCode result is billed to the model the server served", () => {
    setProvider("opencode");
    const event = extractResultEvent(
      lines({
        type: "result",
        is_error: false,
        result: "Renamed the button.",
        duration_ms: 900,
        total_cost_usd: 0.0125,
        model: "openai/gpt-5",
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );

    expect(event).toMatchObject({
      result: "Renamed the button.",
      isError: false,
    });
    expect(tryParseJsonObject(event?.rawResultEvent ?? "")).toMatchObject({
      provider: "opencode",
      total_cost_usd: 0.0125,
      modelUsage: { "openai/gpt-5": {} },
    });
  });

  test.each(["cursor", "opencode"])(
    "a %s error result carries the agent's own message",
    (provider) => {
      setProvider(provider);
      expect(
        extractResultEvent(
          lines({
            type: "result",
            is_error: true,
            result: "rate limit or usage quota exhausted",
          }),
        ),
      ).toMatchObject({
        result: "rate limit or usage quota exhausted",
        isError: true,
      });
    },
  );

  test("a Cursor result with no text falls back to the streamed answer", () => {
    setProvider("cursor");
    expect(
      extractResultEvent(
        lines(assistantText("Renamed "), assistantText("the button."), {
          type: "result",
          is_error: false,
          result: "",
        }),
      ),
    ).toMatchObject({ result: "Renamed the button.", isError: false });
  });

  /**
   * A run that streamed its answer but died before the runner emitted the
   * result line still has an answer; the attempt outcome decides whether a
   * kill or timeout overrides it.
   */
  test("a Cursor run without a result line reports its streamed text", () => {
    setProvider("cursor");
    expect(
      extractResultEvent(
        lines(assistantText("Renamed "), assistantText("the button.")),
      ),
    ).toEqual({
      result: "Renamed the button.",
      isError: false,
      rawResultEvent: "",
    });
  });

  test("a Cursor run with neither a result nor text has no result", () => {
    setProvider("cursor");
    expect(
      extractResultEvent(
        lines({ type: "thinking", text: "planning" }) + "not json\n",
      ),
    ).toBeNull();
  });
});

describe("Codex results", () => {
  test("the last agent message is the answer, billed with the last turn's usage", () => {
    setProvider("codex");
    const event = extractResultEvent(
      lines(
        {
          type: "item.completed",
          item: { id: "item_1", type: "agent_message", text: "Checking." },
        },
        {
          type: "turn.completed",
          usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 5 },
        },
        {
          type: "item.completed",
          item: { id: "item_2", type: "command_execution", exit_code: 0 },
        },
        {
          type: "item.completed",
          item: { id: "item_3", type: "agent_message", text: "Tests pass." },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1000,
            cached_input_tokens: 400,
            output_tokens: 120,
          },
        },
      ),
    );

    expect(event).toMatchObject({ result: "Tests pass.", isError: false });
    expect(tryParseJsonObject(event?.rawResultEvent ?? "")).toMatchObject({
      provider: "codex",
      usage: {
        input_tokens: 600,
        output_tokens: 120,
        cache_read_input_tokens: 400,
        cache_creation_input_tokens: 0,
      },
    });
  });

  test("a turn with no agent message has no result", () => {
    setProvider("codex");
    const output = readFileSync(
      join(import.meta.dirname, "fixtures", "codex-shell-filechange.jsonl"),
      "utf8",
    );
    expect(extractResultEvent(output)).toBeNull();
  });
});
