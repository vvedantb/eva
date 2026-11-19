import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * A session stop that settles (or fails) re-offers the chat queue.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Stopping session",
      status: "stopping",
      sandboxId: "sbx-session",
    });
    return { sessionId };
  });
  return { t, ...ids };
}

type TestConvex = Awaited<ReturnType<typeof fixture>>["t"];

function scheduledDrains(t: TestConvex) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => row.name.includes("drainQueueQuietly"));
  });
}

describe("a stop that settles re-offers the queue", () => {
  // Keeps scheduled drains from firing after the test finishes.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    ["closed", undefined],
    ["failed", "provider timeout"],
  ])(
    "session stop %s schedules a drain",
    async (_label, error) => {
      const { t, sessionId } = await fixture();

      await t.mutation(internal._sessions.sandbox.markSandboxClosed, {
        sessionId,
        error,
      });

      const drains = await scheduledDrains(t);
      expect(drains.map((row) => row.args[0])).toEqual([
        { parentId: sessionId },
      ]);
    },
    TIMEOUT_MS,
  );
});
