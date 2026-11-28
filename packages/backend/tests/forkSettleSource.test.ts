import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


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
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Seeded local DB",
      status: source.status,
      numId: 1,
      sandboxId: "sbx_source",
      branchName: "eva/session-source",
      ...(source.archived ? { archive: { archivedAt: 1 } } : {}),
    });
    const forkId = await ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
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
