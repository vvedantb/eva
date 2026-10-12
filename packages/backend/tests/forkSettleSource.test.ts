import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Fix #870 (Fork session). `forkSession` stops a running source so Vercel's
 * fork restores from a fresh snapshot, and the fork's first boot calls
 * `settleForkSource` once the fork has been taken or has failed. Two bugs this
 * guards:
 *
 * - A source sandbox deleted before the fork's first boot left
 *   `forkSourceSandboxId` set, so every Start retried a fork that could never
 *   work. `sourceGone` must drop it; a transient failure must keep it so a
 *   retry forks the same source again.
 * - The source must restart only while it is still parked by the fork. A
 *   source the user already woke, or archived since, must be left alone, and
 *   settling twice must not restart it twice.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;

async function fixture(source: {
  status: Doc<"sessions">["status"];
  archived?: boolean;
}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|fork" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "fork-settle-source",
      installationId: 1,
      connectedBy: userId,
    });
    const sourceId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Seeded local DB",
      status: source.status,
      numId: 1,
      sandboxId: "sbx_source",
      branchName: "eva/session-source",
      ...(source.archived ? { archived: true } : {}),
    });
    const forkId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Fork · Seeded local DB",
      status: "starting",
      numId: 2,
      forkedFromSessionId: sourceId,
      forkSourceSandboxId: "sbx_source",
      forkRestartsSource: true,
    });
    return { sourceId, forkId };
  });
  return { t, ...ids };
}

/** Keeps the zero-delay sandbox start the restart schedules from firing. */
async function settle(
  f: Awaited<ReturnType<typeof fixture>>,
  sourceGone: boolean,
): Promise<void> {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    await f.t.mutation(internal.sessions.settleForkSource, {
      sessionId: f.forkId,
      sourceGone,
    });
  } finally {
    vi.useRealTimers();
  }
}

async function read(f: Awaited<ReturnType<typeof fixture>>) {
  return f.t.run(async (ctx) => ({
    source: await ctx.db.get(f.sourceId),
    fork: await ctx.db.get(f.forkId),
  }));
}

describe("settling a fork's source", () => {
  test(
    "a gone source is dropped so the next Start boots the repo snapshot",
    async () => {
      const f = await fixture({ status: "closed" });
      await settle(f, true);

      const { fork } = await read(f);
      expect(fork?.forkSourceSandboxId).toBeUndefined();
      expect(fork?.forkRestartsSource).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a taken or transiently failed fork keeps its source for a retry",
    async () => {
      const f = await fixture({ status: "closed" });
      await settle(f, false);

      const { fork } = await read(f);
      expect(fork?.forkSourceSandboxId).toBe("sbx_source");
      expect(fork?.forkRestartsSource).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "restarts a source the fork parked, once",
    async () => {
      const f = await fixture({ status: "closed" });
      await settle(f, false);
      expect((await read(f)).source?.status).toBe("starting");

      // The user stops it again; a repeat settle must not wake it.
      await f.t.run((ctx) => ctx.db.patch(f.sourceId, { status: "closed" }));
      await settle(f, false);
      expect((await read(f)).source?.status).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "leaves an archived source parked",
    async () => {
      const f = await fixture({ status: "closed", archived: true });
      await settle(f, false);

      expect((await read(f)).source?.status).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "leaves a source the user already woke alone",
    async () => {
      const f = await fixture({ status: "active" });
      await settle(f, false);

      const { source } = await read(f);
      expect(source?.status).toBe("active");
      // A restart would have re-seeded the startup step for the source.
      const seeded = await f.t.run((ctx) =>
        ctx.db
          .query("streamingActivity")
          .withIndex("by_entity", (q) =>
            q.eq("entityId", `session-startup-${f.sourceId}`),
          )
          .first(),
      );
      expect(seeded).toBeNull();
    },
    TIMEOUT_MS,
  );
});
