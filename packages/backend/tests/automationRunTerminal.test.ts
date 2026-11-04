import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * An automation run's success / error / cancelled is final. A workflow that
 * finishes after the user pressed Cancel used to flip the run to success and
 * send the success email; Cancel also left the ephemeral sandbox running
 * because a cancelled workflow never reaches its `finally`.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const OWNER = "clerk|automation-owner";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function runWithStatus(status: Doc<"automationRuns">["status"]) {
  const t = convexTest(schema, modules);
  const runId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: OWNER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const automationId = await ctx.db.insert("automations", {
      repoId,
      title: "Nightly audit",
      description: "Audit the repo",
      cronSchedule: "",
      enabled: true,
      sendEmail: true,
      createdBy: userId,
      createdAt: 0,
      updatedAt: 0,
    });
    return ctx.db.insert("automationRuns", {
      automationId,
      repoId,
      status,
      startedAt: 0,
      acknowledged: false,
      sandboxId: "sbx_auto",
    });
  });
  const read = () => t.run(async (ctx) => ctx.db.get(runId));
  const scheduled = () =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (job) => job.name,
      ),
    );
  return {
    t,
    runId,
    read,
    scheduled,
    owner: t.withIdentity({ subject: OWNER }),
  };
}

describe("automation run terminal states", () => {
  test(
    "a late success does not overwrite a cancel or send the email",
    async () => {
      const f = await runWithStatus("cancelled");
      await f.t.mutation(internal.automations.updateRunStatus, {
        runId: f.runId,
        status: "success",
        resultSummary: "done",
      });
      expect((await f.read())?.status).toBe("cancelled");
      expect(await f.scheduled()).not.toContain(
        "automationEmail:sendAutomationEmail",
      );
    },
    TIMEOUT_MS,
  );

  test(
    "cancel deletes the ephemeral sandbox",
    async () => {
      const f = await runWithStatus("running");
      await f.owner.mutation(api.automations.cancelRun, { runId: f.runId });
      expect((await f.read())?.status).toBe("cancelled");
      expect(await f.scheduled()).toContain("sandbox:deleteSandbox");
    },
    TIMEOUT_MS,
  );

  /**
   * Event preset runs settle through `settleEventRun`, not `updateRunStatus`.
   * A run the user cancelled (or the watchdog expired) must stay that way,
   * but the event cursor still has to advance, or the next webhook replays
   * the same PR events.
   */
  test(
    "a late event settle keeps the cancel but advances the cursor",
    async () => {
      const f = await runWithStatus("cancelled");
      await f.t.mutation(internal._automationEvents.dispatch.settleEventRun, {
        runId: f.runId,
        status: "success",
        message: "Fixed CI",
        eventCursor: 42,
      });
      const run = await f.read();
      expect(run?.status).toBe("cancelled");
      expect(run?.resultSummary).toBeUndefined();
      expect(run?.finishedAt).toBeUndefined();
      expect(run?.eventCursor).toBe(42);
    },
    TIMEOUT_MS,
  );

  test(
    "an event settle on a running run records the outcome",
    async () => {
      const f = await runWithStatus("running");
      await f.t.mutation(internal._automationEvents.dispatch.settleEventRun, {
        runId: f.runId,
        status: "error",
        message: "CI still red",
        eventCursor: 7,
      });
      const run = await f.read();
      expect(run?.status).toBe("error");
      expect(run?.error).toBe("CI still red");
      expect(run?.finishedAt).toBeDefined();
      expect(run?.eventCursor).toBe(7);
    },
    TIMEOUT_MS,
  );

  test(
    "cancel on a finished run changes nothing",
    async () => {
      const f = await runWithStatus("success");
      await f.owner.mutation(api.automations.cancelRun, { runId: f.runId });
      const run = await f.read();
      expect(run?.status).toBe("success");
      expect(run?.finishedAt).toBeUndefined();
    },
    TIMEOUT_MS,
  );

  test(
    "a late event-run settle keeps the cancel but still advances the cursor",
    async () => {
      const f = await runWithStatus("cancelled");
      await f.t.mutation(internal._automationEvents.dispatch.settleEventRun, {
        runId: f.runId,
        status: "success",
        message: "Sent 2 review comments",
        eventCursor: 42,
      });
      const run = await f.read();
      expect(run?.status).toBe("cancelled");
      expect(run?.resultSummary).toBeUndefined();
      // Without the cursor, the next webhook would resend the same comments.
      expect(run?.eventCursor).toBe(42);
    },
    TIMEOUT_MS,
  );

  test(
    "a live event run settles with its status, message and cursor",
    async () => {
      const f = await runWithStatus("running");
      await f.t.mutation(internal._automationEvents.dispatch.settleEventRun, {
        runId: f.runId,
        status: "error",
        message: "PR is closed",
        eventCursor: 7,
      });
      const run = await f.read();
      expect(run?.status).toBe("error");
      expect(run?.error).toBe("PR is closed");
      expect(run?.eventCursor).toBe(7);
      expect(run?.finishedAt).toBeTypeOf("number");
    },
    TIMEOUT_MS,
  );
});
