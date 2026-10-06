import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Manager Ave's run state machine (`_ave/threads.ts`, `_ave/run.ts`). One run
 * per thread; arrivals mid-run collapse into one rerun; every run write is
 * fenced on `runId` so a cancelled, reset or reclaimed run lands nowhere.
 * Scheduled runs are never executed here — only the state they are fenced on.
 */

const modules = import.meta.glob("../convex/**/*.ts");

// Only `setTimeout` is faked, so the zero-delay run and watchdog convex-test
// schedules never fire: the model call cannot succeed here, and its failure
// path would overwrite the state under test.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});
const TIMEOUT_MS = 30_000;
const OWNER = "clerk|ave-owner";
const STRANGER = "clerk|ave-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", { clerkId: OWNER });
    const strangerUserId = await ctx.db.insert("users", { clerkId: STRANGER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Fix the login bug",
      status: "active",
    });
    return { ownerUserId, strangerUserId, repoId, sessionId };
  });
  return {
    t,
    owner: t.withIdentity({ subject: OWNER }),
    stranger: t.withIdentity({ subject: STRANGER }),
    ...ids,
  };
}

async function liveThread(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.t.run(async (ctx) =>
    ctx.db
      .query("aveThreads")
      .withIndex("by_user_and_archived", (q) =>
        q.eq("userId", f.ownerUserId).eq("archivedAt", undefined),
      )
      .first(),
  );
}

async function rows(f: Awaited<ReturnType<typeof fixture>>) {
  const thread = await liveThread(f);
  if (!thread) return [];
  return await f.t.run(async (ctx) =>
    ctx.db
      .query("aveMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
      .collect(),
  );
}

describe("Manager Ave run state", () => {
  test(
    "a send while idle opens a thread and starts one run",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      expect(thread?.status).toBe("running");
      expect(thread?.runId).toBeDefined();
      expect((await rows(f)).map((r) => [r.role, r.content])).toEqual([
        ["user", "hi"],
      ]);
    },
    TIMEOUT_MS,
  );

  test(
    "a send while running asks for a rerun instead of a second run",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "one", clientId: "c1" });
      const first = await liveThread(f);
      await f.owner.mutation(api.ave.send, { content: "two", clientId: "c2" });
      const second = await liveThread(f);
      expect(second?.runId).toBe(first?.runId);
      expect(second?.rerunRequested).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "a stale run's writes land nowhere",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread) throw new Error("no thread");
      await f.t.mutation(internal._ave.run.finishRun, {
        threadId: thread._id,
        runId: "not-the-run",
        content: "late",
        activityLog: "[]",
      });
      expect((await liveThread(f))?.status).toBe("running");
      expect(await rows(f)).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "finishing writes the reply, then starts the requested rerun",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "one", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread?.runId) throw new Error("no run");
      const claim = await f.t.mutation(internal._ave.run.claimRun, {
        threadId: thread._id,
        runId: thread.runId,
      });
      expect(claim?.clerkUserId).toBe(OWNER);
      await f.owner.mutation(api.ave.send, { content: "two", clientId: "c2" });
      await f.t.mutation(internal._ave.run.finishRun, {
        threadId: thread._id,
        runId: thread.runId,
        content: "done one",
        activityLog: "[]",
      });
      const after = await liveThread(f);
      expect(after?.status).toBe("running");
      expect(after?.runId).not.toBe(thread.runId);
      const reply = (await rows(f)).find((r) => r.role === "assistant");
      expect(reply?.content).toBe("done one");
      expect(reply?.finishedAt).toBeDefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a stop drops the pending rerun and idles the thread",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "one", clientId: "c1" });
      await f.owner.mutation(api.ave.send, { content: "two", clientId: "c2" });
      await f.owner.mutation(api.ave.cancel, {});
      const thread = await liveThread(f);
      if (!thread?.runId) throw new Error("no run");
      expect(thread.cancelRequested).toBe(true);
      expect(thread.rerunRequested).toBeUndefined();
      await f.t.mutation(internal._ave.run.finishRun, {
        threadId: thread._id,
        runId: thread.runId,
        content: "Stopped.",
        activityLog: "[]",
      });
      expect((await liveThread(f))?.status).toBe("idle");
    },
    TIMEOUT_MS,
  );

  test(
    "the watchdog reclaims a run that never finished",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread?.runId) throw new Error("no run");
      await f.t.mutation(internal._ave.run.watchdog, {
        threadId: thread._id,
        runId: thread.runId,
      });
      expect((await liveThread(f))?.status).toBe("idle");
      expect((await rows(f)).some((r) => r.isSystemAlert === true)).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "reset archives the thread and fences its run out",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      await f.owner.mutation(api.ave.reset, {});
      expect(await liveThread(f)).toBeNull();
      expect(await f.owner.query(api.ave.listMessages, {})).toEqual([]);
    },
    TIMEOUT_MS,
  );
});

describe("wake-ups and watches", () => {
  test(
    "a watched child finishing wakes Ave with a notification row",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread?.runId) throw new Error("no run");
      await f.owner.mutation(api.orchestratorWatch.setSessionWatchedBy, {
        sessionId: f.sessionId,
        aveThreadId: thread._id,
      });
      await f.t.mutation(internal.orchestratorNotify.notifyOrchestratorOfChild, {
        child: { kind: "session", sessionId: f.sessionId },
        status: "completed",
      });
      const notification = (await rows(f)).find(
        (r) => r.orchestratorNotification === true,
      );
      expect(notification?.content).toContain(
        '[agent-notification] session "Fix the login bug" (vvedantb/eva) finished: completed',
      );
      // Ave was already running, so the wake-up folds into one rerun.
      expect((await liveThread(f))?.rerunRequested).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "a watched project's chat finishing wakes Ave too",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread) throw new Error("no thread");
      const projectId = await f.t.run(async (ctx) =>
        ctx.db.insert("projects", {
          repoId: f.repoId,
          userId: f.ownerUserId,
          title: "Billing revamp",
          phase: "in_progress",
          rawInput: "revamp billing",
          updatedAt: 1,
        }),
      );
      await f.owner.mutation(api.orchestratorWatch.setProjectWatchedBy, {
        projectId,
        aveThreadId: thread._id,
      });
      await f.t.mutation(internal.orchestratorNotify.notifyOrchestratorOfChild, {
        child: { kind: "project", projectId },
        status: "completed",
      });
      const notification = (await rows(f)).find(
        (r) => r.orchestratorNotification === true,
      );
      expect(notification?.content).toContain(
        '[agent-notification] project "Billing revamp" (vvedantb/eva) finished: completed',
      );
    },
    TIMEOUT_MS,
  );

  test(
    "a watch on a reset thread is cleared instead of waking anyone",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread) throw new Error("no thread");
      await f.owner.mutation(api.orchestratorWatch.setSessionWatchedBy, {
        sessionId: f.sessionId,
        aveThreadId: thread._id,
      });
      await f.owner.mutation(api.ave.reset, {});
      await f.t.mutation(internal.orchestratorNotify.notifyOrchestratorOfChild, {
        child: { kind: "session", sessionId: f.sessionId },
        status: "completed",
      });
      const session = await f.t.run(async (ctx) => ctx.db.get(f.sessionId));
      expect(session?.watchedByAve).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "nobody can point a watch at someone else's thread",
    async () => {
      const f = await fixture();
      await f.owner.mutation(api.ave.send, { content: "hi", clientId: "c1" });
      const thread = await liveThread(f);
      if (!thread) throw new Error("no thread");
      const strangerSession = await f.t.run(async (ctx) => {
        const repoId = await ctx.db.insert("githubRepos", {
          owner: "someone",
          name: "else",
          installationId: 2,
          connectedBy: f.strangerUserId,
        });
        return ctx.db.insert("sessions", {
          repoId,
          userId: f.strangerUserId,
          title: "Theirs",
          status: "active",
        });
      });
      await expect(
        f.stranger.mutation(api.orchestratorWatch.setSessionWatchedBy, {
          sessionId: strangerSession,
          aveThreadId: thread._id,
        }),
      ).rejects.toThrow("Not authorized");
    },
    TIMEOUT_MS,
  );
});
