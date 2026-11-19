import { describe, expect, test } from "vitest";
import {
  buildCodexResultEvent,
  buildTurnCompletionPayload,
} from "../runtime/completion.js";

describe("buildCodexResultEvent", () => {
  test("reports non-cached input apart from cache reads and writes", () => {
    const event = JSON.parse(
      buildCodexResultEvent({
        inputTokens: 1000,
        cachedInputTokens: 400,
        cacheWriteInputTokens: 50,
        outputTokens: 200,
      }),
    );
    expect(event.type).toBe("result");
    expect(event.provider).toBe("codex");
    expect(typeof event.total_cost_usd).toBe("number");
    expect(typeof event.duration_ms).toBe("number");
    expect(event.usage).toEqual({
      input_tokens: 600,
      output_tokens: 200,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 50,
    });
  });

  test("never reports negative input when cache exceeds the total", () => {
    const event = JSON.parse(
      buildCodexResultEvent({
        inputTokens: 10,
        cachedInputTokens: 40,
        cacheWriteInputTokens: 0,
        outputTokens: 0,
      }),
    );
    expect(event.usage.input_tokens).toBe(0);
  });
});

describe("buildTurnCompletionPayload", () => {
  const base = {
    success: true,
    result: "done",
    error: null,
    activityLog: "[]",
  };

  test("carries a caller-built rawResultEvent", () => {
    const payload = buildTurnCompletionPayload({
      ...base,
      rawResultEvent: '{"type":"result"}',
    });
    expect(payload.rawResultEvent).toBe('{"type":"result"}');
  });

  test("prefers the parsed result event over the caller-built one", () => {
    const payload = buildTurnCompletionPayload({
      ...base,
      resultEvent: {
        result: "done",
        isError: false,
        rawResultEvent: '{"from":"event"}',
      },
      rawResultEvent: '{"from":"caller"}',
    });
    expect(payload.rawResultEvent).toBe('{"from":"event"}');
  });

  test("omits rawResultEvent when neither source has one", () => {
    const payload = buildTurnCompletionPayload(base);
    expect("rawResultEvent" in payload).toBe(false);
  });
});
