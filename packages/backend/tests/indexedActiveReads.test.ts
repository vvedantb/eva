import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Bandwidth fix a1146b42 moved the sandbox sweeps from full scans plus a
 * filter onto status indexes. The failure mode is silent: a sweep that misses
 * a live sandbox leaks a VM.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|indexed-active-reads";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    return { userId, repoId };
  });
  return { t, asUser: t.withIdentity({ subject: CLERK_ID }), ...ids };
}

describe("active sandbox sweeps", () => {
  test(
    "find every active session sandbox, and nothing else",
    async () => {
      const f = await fixture();
      const ids = await f.t.run(async (ctx) => {
        const session = (
          title: string,
          status: "active" | "closed",
          sandboxId?: string,
        ) =>
          ctx.db.insert("sessions", {
            owner: { kind: "standalone" },
            repoId: f.repoId,
            userId: f.userId,
            title,
            status,
            ...(sandboxId === undefined ? {} : { sandboxId }),
          });
        const liveSession = await session("Live", "active", "sbx-session");
        await session("Closed", "closed", "sbx-session-old");
        await session("Active, no sandbox yet", "active");
        return { liveSession };
      });

      const sweep = await f.t.query(
        internal.sandboxAutoStop.listActiveSandboxes,
      );
      expect(sweep).toEqual({ sessionIds: [ids.liveSession] });

      const entities = await f.t.query(
        internal.sandboxDaemon.listActiveSandboxEntities,
      );
      expect(entities).toEqual([
        {
          entityTable: "sessions",
          entityId: String(ids.liveSession),
          sandboxId: "sbx-session",
          repoId: f.repoId,
        },
      ]);
    },
    TIMEOUT_MS,
  );
});
