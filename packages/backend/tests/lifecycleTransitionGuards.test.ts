import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { requestSessionSandboxStart } from "../convex/_sessions/sandbox";
import { modules } from "./_helpers/convexModules";

/**
 * Behaviour of the sandbox lifecycle: a start never overrides a stop in
 * flight, and a start failure only closes a sandbox that is still
 * `starting`. (A project's status is derived from its tasks; see
 * `projectStatus.test.ts`.)
 */

const TIMEOUT_MS = 30_000;

type SandboxStatus = Doc<"sessions">["status"];

async function sessionWithStatus(
  status: SandboxStatus,
  sandboxStartAttempt?: number,
) {
  const t = convexTest(schema, modules);
  const sessionId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|ada" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    return ctx.db.insert("sessions", {
      owner: { kind: "standalone" },
      repoId,
      userId,
      title: "Fix the login bug",
      status,
      sandboxId: "sbx_1",
      sandboxStartAttempt,
    });
  });
  const readStatus = () =>
    t.run(async (ctx) => (await ctx.db.get(sessionId))?.status);
  const scheduledNames = () =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (job) => job.name,
      ),
    );
  return { t, sessionId, status: readStatus, scheduledNames };
}

describe("sandbox lifecycle guards", () => {
  // Ready and start schedule follow-up jobs; fake timers keep them from
  // running after the test's transaction has closed.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test(
    "start does not override a stop in flight",
    async () => {
      const s = await sessionWithStatus("stopping");
      await s.t.run(async (ctx) => {
        const session = await ctx.db.get(s.sessionId);
        if (session) await requestSessionSandboxStart(ctx, session);
      });
      expect(await s.status()).toBe("stopping");
    },
    TIMEOUT_MS,
  );

  test(
    "a late start failure leaves active and stopping sandboxes alone",
    async () => {
      for (const status of ["active", "stopping", "closed"] as const) {
        const s = await sessionWithStatus(status);
        await s.t.mutation(internal.sessions.sandboxError, {
          sessionId: s.sessionId,
          error: "boom",
        });
        expect(await s.status()).toBe(status);
      }
    },
    TIMEOUT_MS,
  );

  test(
    "a start failure closes a sandbox that is still starting",
    async () => {
      const s = await sessionWithStatus("starting");
      await s.t.mutation(internal.sessions.sandboxError, {
        sessionId: s.sessionId,
        error: "boom",
      });
      expect(await s.status()).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "each start request takes a new attempt number",
    async () => {
      const s = await sessionWithStatus("closed");
      const attempts = await s.t.run(async (ctx) => {
        const seen: (number | undefined)[] = [];
        for (let i = 0; i < 2; i++) {
          const session = await ctx.db.get(s.sessionId);
          if (session) await requestSessionSandboxStart(ctx, session);
          seen.push((await ctx.db.get(s.sessionId))?.sandboxStartAttempt);
        }
        return seen;
      });
      expect(attempts).toEqual([1, 2]);
    },
    TIMEOUT_MS,
  );

  test(
    "an older attempt cannot fail or ready a newer start",
    async () => {
      const s = await sessionWithStatus("starting", 2);
      await s.t.mutation(internal.sessions.sandboxError, {
        sessionId: s.sessionId,
        error: "boom",
        startAttempt: 1,
      });
      expect(await s.status()).toBe("starting");

      await s.t.mutation(internal.sessions.sandboxReady, {
        sessionId: s.sessionId,
        sandboxId: "sbx_stale",
        branchName: "eva/session",
        isNew: true,
        startAttempt: 1,
      });
      expect(await s.status()).toBe("starting");
      // The stale attempt's own VM is not tracked by the row, so it is deleted.
      expect(await s.scheduledNames()).toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "a stale ready on the shared VM does not delete it",
    async () => {
      const s = await sessionWithStatus("starting", 2);
      await s.t.mutation(internal.sessions.sandboxReady, {
        sessionId: s.sessionId,
        sandboxId: "sbx_1",
        branchName: "eva/session",
        isNew: false,
        startAttempt: 1,
      });
      expect(await s.scheduledNames()).not.toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "a stale attempt that resumed another VM stops it instead of deleting it",
    async () => {
      const s = await sessionWithStatus("starting", 2);
      await s.t.mutation(internal.sessions.sandboxReady, {
        sessionId: s.sessionId,
        sandboxId: "sbx_old",
        branchName: "eva/session",
        isNew: false,
        startAttempt: 1,
      });
      const jobs = await s.scheduledNames();
      expect(jobs).toContain("sandbox:stopSandbox");
      expect(jobs).not.toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "the current attempt still settles the sandbox",
    async () => {
      const s = await sessionWithStatus("starting", 2);
      await s.t.mutation(internal.sessions.sandboxError, {
        sessionId: s.sessionId,
        error: "boom",
        startAttempt: 2,
      });
      expect(await s.status()).toBe("closed");
    },
    TIMEOUT_MS,
  );

  test(
    "a start that lands after archive or stop deletes its own fresh VM",
    async () => {
      const s = await sessionWithStatus("closed", 3);
      await s.t.mutation(internal.sessions.sandboxReady, {
        sessionId: s.sessionId,
        sandboxId: "sbx_fresh",
        branchName: "eva/session",
        isNew: true,
        startAttempt: 3,
      });
      expect(await s.status()).toBe("closed");
      expect(await s.scheduledNames()).toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "an untokened prepare keeps its VM, since its caller goes on to use it",
    async () => {
      const s = await sessionWithStatus("closed", 3);
      await s.t.mutation(internal.sessions.sandboxReady, {
        sessionId: s.sessionId,
        sandboxId: "sbx_execute",
        branchName: "eva/session",
        isNew: true,
      });
      expect(await s.scheduledNames()).not.toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  test(
    "every start request schedules its own stuck-start expiry",
    async () => {
      const s = await sessionWithStatus("closed");
      await s.t.run(async (ctx) => {
        const session = await ctx.db.get(s.sessionId);
        if (session) await requestSessionSandboxStart(ctx, session);
      });
      expect(await s.scheduledNames()).toContain("sessions:sandboxError");
    },
    TIMEOUT_MS,
  );
});
