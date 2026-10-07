import { describe, expect, test } from "vitest";
import { awaitSandboxActive } from "../convex/mcp/orchestratorDelivery";

/**
 * The start-and-wait loop shared by the MCP `start_sandbox` path and the
 * `/p/…` wake link. Driven with fake I/O so the race handling (a stop settling
 * to closed, a start that never comes up) is pinned without a sandbox.
 */

function harness(statuses: Array<string | undefined>) {
  let reads = 0;
  let starts = 0;
  let clock = 0;
  return {
    starts: () => starts,
    reads: () => reads,
    deps: {
      kind: "session" as const,
      readStatus: async () => {
        const status = statuses[Math.min(reads, statuses.length - 1)];
        reads += 1;
        return status;
      },
      start: async () => {
        starts += 1;
      },
      sleep: async (ms: number) => {
        clock += ms;
      },
      now: () => clock,
      timeoutMs: 10_000,
      pollMs: 1_000,
    },
  };
}

describe("awaitSandboxActive", () => {
  test("an active sandbox needs no start", async () => {
    const h = harness(["active"]);
    await expect(awaitSandboxActive(h.deps)).resolves.toEqual({
      startRequested: false,
    });
    expect(h.starts()).toBe(0);
  });

  test("a closed sandbox is started once and waited on", async () => {
    const h = harness(["closed", "starting", "starting", "active"]);
    await expect(awaitSandboxActive(h.deps)).resolves.toEqual({
      startRequested: true,
    });
    expect(h.starts()).toBe(1);
  });

  test("a start already in flight is waited on, not duplicated", async () => {
    const h = harness(["starting", "starting", "active"]);
    await expect(awaitSandboxActive(h.deps)).resolves.toEqual({
      startRequested: false,
    });
    expect(h.starts()).toBe(0);
  });

  test("a stop that settles to closed gets exactly one start", async () => {
    const h = harness(["stopping", "stopping", "closed", "starting", "active"]);
    await expect(awaitSandboxActive(h.deps)).resolves.toEqual({
      startRequested: true,
    });
    expect(h.starts()).toBe(1);
  });

  test("a start that falls back to closed is reported, never retried", async () => {
    const h = harness(["closed", "starting", "closed"]);
    await expect(awaitSandboxActive(h.deps)).rejects.toThrow(
      /did not become ready/,
    );
    expect(h.starts()).toBe(1);
  });

  test("never reaching active times out with a clear message", async () => {
    const h = harness(["closed", "starting"]);
    await expect(awaitSandboxActive(h.deps)).rejects.toThrow(/Timed out/);
  });
});
