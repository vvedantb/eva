import { describe, expect, it } from "vitest";
import {
  silentStreamDelayMs,
  thinkingHeartbeatLabel,
  thinkingHeartbeatSeconds,
  visibleActivityKey,
} from "./streamingActivityHeartbeat";

function payload(
  steps: Array<Record<string, unknown>>,
): string {
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
      { type: "reasoning", label: "Thought", detail: "plan", status: "complete" },
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
