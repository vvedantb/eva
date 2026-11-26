import { describe, expect, it } from "bun:test";
import {
  silentStreamDelayMs,
  thinkingHeartbeatLabel,
  thinkingHeartbeatSeconds,
  visibleActivityKey,
} from "./streamingActivityHeartbeat";

function payload(steps: Array<Record<string, unknown>>): string {
  return JSON.stringify(
    steps.map((step) => ({
      status: "active",
      ...step,
    })),
  );
}

describe("visibleActivityKey", () => {
  it("treats reasoning-only updates as no visible output", () => {
    const first = payload([
      { type: "reasoning", label: "Thought", detail: "weighing it" },
    ]);
    const longer = payload([
      { type: "reasoning", label: "Thought", detail: "weighing it further" },
    ]);
    expect(visibleActivityKey(first)).toBe("");
    expect(visibleActivityKey(longer)).toBe(visibleActivityKey(first));
  });

  it("ignores legacy thinking rows the same way", () => {
    expect(
      visibleActivityKey(
        payload([{ type: "thinking", label: "Thinking...", detail: "Hmm" }]),
      ),
    ).toBe("");
  });

  it("changes when a tool row appears beside thinking", () => {
    const thinking = payload([
      { type: "reasoning", label: "Thought", detail: "plan" },
    ]);
    const withRead = payload([
      {
        type: "reasoning",
        label: "Thought",
        detail: "plan",
        status: "complete",
      },
      {
        type: "read",
        label: "Read file",
        path: "a.ts",
        status: "complete",
      },
    ]);
    expect(visibleActivityKey(thinking)).toBe("");
    expect(visibleActivityKey(withRead)).not.toBe("");
    expect(visibleActivityKey(withRead)).not.toBe(visibleActivityKey(thinking));
  });

  it("treats empty and missing payloads as no visible output", () => {
    expect(visibleActivityKey(undefined)).toBe("");
    expect(visibleActivityKey("[]")).toBe("");
  });
});

describe("visibleActivityKey fingerprints work without re-encoding it", () => {
  const ranCommand = (fields: Record<string, unknown>): string =>
    payload([
      {
        type: "bash",
        label: "Running command...",
        command: "pnpm test",
        ...fields,
      },
    ]);

  it("stays small however large the captured output is", () => {
    const key = visibleActivityKey(
      ranCommand({ output: { text: "x".repeat(200_000) } }),
    );
    expect(key).not.toContain("xxxx");
    expect(key.length).toBeLessThan(200);
  });

  it("still moves when the output grows", () => {
    expect(visibleActivityKey(ranCommand({ output: { text: "ab" } }))).not.toBe(
      visibleActivityKey(ranCommand({ output: { text: "abc" } })),
    );
  });

  it("moves when a tool settles", () => {
    expect(visibleActivityKey(ranCommand({ status: "active" }))).not.toBe(
      visibleActivityKey(ranCommand({ status: "complete", durationMs: 1_200 })),
    );
  });

  it("moves when a tool fails", () => {
    expect(
      visibleActivityKey(ranCommand({ status: "complete", durationMs: 40 })),
    ).not.toBe(
      visibleActivityKey(
        ranCommand({ status: "complete", durationMs: 40, isError: true }),
      ),
    );
  });

  it("moves when a todo changes state without changing the list", () => {
    const todos = (second: string): string =>
      payload([
        {
          type: "todos",
          label: "Updating tasks...",
          todos: [
            { content: "one", status: "completed" },
            { content: "two", status: second },
          ],
        },
      ]);
    expect(visibleActivityKey(todos("pending"))).not.toBe(
      visibleActivityKey(todos("in_progress")),
    );
  });
});

describe("thinkingHeartbeatSeconds", () => {
  it("prints the first beat at 30s and snaps until the next", () => {
    expect(thinkingHeartbeatSeconds(0)).toBeNull();
    expect(thinkingHeartbeatSeconds(29)).toBeNull();
    expect(thinkingHeartbeatSeconds(30)).toBe(30);
    expect(thinkingHeartbeatSeconds(59)).toBe(30);
    expect(thinkingHeartbeatSeconds(60)).toBe(60);
    expect(thinkingHeartbeatSeconds(90)).toBe(90);
  });
});

describe("thinkingHeartbeatLabel", () => {
  it("matches the operational heartbeat copy", () => {
    expect(thinkingHeartbeatLabel(30)).toBe(
      "Model is thinking... (30s since last output)",
    );
  });
});

describe("silentStreamDelayMs", () => {
  it("waits out the remaining grace from startedAt", () => {
    expect(silentStreamDelayMs(1_000, 21_000, 60)).toBe(40_000);
  });

  it("is zero once the grace has elapsed", () => {
    expect(silentStreamDelayMs(1_000, 61_000, 60)).toBe(0);
  });
});
