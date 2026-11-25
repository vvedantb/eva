import { describe, expect, test } from "bun:test";
import { isVisibleBackgroundAgent } from "@eva/shared/backgroundAgents";

describe("isVisibleBackgroundAgent", () => {
  test("hides a running foreground subagent", () => {
    expect(
      isVisibleBackgroundAgent({
        toolUseId: "tool-foreground",
        status: "running",
        startedAt: 1,
      }),
    ).toBe(false);
  });

  test("shows a running agent only after it is backgrounded", () => {
    expect(
      isVisibleBackgroundAgent({
        toolUseId: "tool-background",
        status: "running",
        backgrounded: true,
        startedAt: 1,
      }),
    ).toBe(true);
  });

  test("hides a settled background agent", () => {
    expect(
      isVisibleBackgroundAgent({
        toolUseId: "tool-complete",
        status: "completed",
        backgrounded: true,
        startedAt: 1,
        settledAt: 2,
      }),
    ).toBe(false);
  });
});
