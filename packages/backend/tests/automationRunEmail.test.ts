import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * A successful run's email waits as a draft for review (#1104). Guards:
 * - review is the default, so nothing is delivered until someone sends it;
 * - only a `sent` email is delivered, and only a `draft` can change, so a
 *   double click cannot send twice and a discarded draft never sends;
 * - recipients stay "every user with email notifications on", not just the
 *   automation's creator.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const OWNER = "clerk|automation-owner";
const DELIVERY = "automationEmail:sendAutomationEmail";
const PREV_WEB_APP_URL = process.env.WEB_APP_URL;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  process.env.WEB_APP_URL = "https://eva.example.com";
});
afterEach(() => {
  vi.useRealTimers();
  if (PREV_WEB_APP_URL === undefined) delete process.env.WEB_APP_URL;
  else process.env.WEB_APP_URL = PREV_WEB_APP_URL;
});

async function succeededRun(opts: { emailAutoSend?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const runId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: OWNER,
      email: "owner@example.com",
      emailNotificationsEnabled: true,
      firstName: "Owner",
    });
    await ctx.db.insert("users", {
      clerkId: "clerk|teammate",
      email: "teammate@example.com",
      emailNotificationsEnabled: true,
    });
    await ctx.db.insert("users", {
      clerkId: "clerk|opted-out",
      email: "opted-out@example.com",
      emailNotificationsEnabled: false,
    });
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
      emailAutoSend: opts.emailAutoSend,
      createdBy: userId,
      createdAt: 0,
      updatedAt: 0,
    });
    return ctx.db.insert("automationRuns", {
      automationId,
      repoId,
      status: "running",
      startedAt: 0,
      acknowledged: false,
    });
  });
  await t.mutation(internal.automations.updateRunStatus, {
    runId,
    status: "success",
    resultSummary: "All **green**",
  });
  const deliveries = async () =>
    (
      await t.run(async (ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      )
    ).filter((job) => job.name === DELIVERY).length;
  return {
    t,
    runId,
    owner: t.withIdentity({ subject: OWNER }),
    email: async () => (await t.run(async (ctx) => ctx.db.get(runId)))?.email,
    deliveries,
    forDelivery: () =>
      t.query(internal.automations.getRunForEmail, { runId }),
  };
}

describe("automation run email", () => {
  test(
    "a success drafts the email for review and delivers nothing",
    async () => {
      const f = await succeededRun();
      expect(await f.email()).toEqual({
        status: "draft",
        subject: "Nightly audit #1",
        body: "All **green**",
      });
      expect(await f.deliveries()).toBe(0);
      expect(await f.forDelivery()).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "the draft goes to every opted-in user, not only the creator",
    async () => {
      const f = await succeededRun();
      const preview = await f.owner.query(api.automations.previewRunEmail, {
        runId: f.runId,
      });
      expect(preview?.recipientCount).toBe(2);
    },
    TIMEOUT_MS,
  );

  test(
    "sending a draft delivers once; a second send and later edits are refused",
    async () => {
      const f = await succeededRun();
      await f.owner.mutation(api.automations.updateRunEmail, {
        runId: f.runId,
        subject: "  Edited subject  ",
        body: "Edited body",
      });
      await f.owner.mutation(api.automations.sendRunEmail, { runId: f.runId });
      await expect(
        f.owner.mutation(api.automations.sendRunEmail, { runId: f.runId }),
      ).rejects.toThrow("no longer a draft");
      await expect(
        f.owner.mutation(api.automations.updateRunEmail, {
          runId: f.runId,
          subject: "Too late",
          body: "Too late",
        }),
      ).rejects.toThrow("no longer a draft");

      expect(await f.deliveries()).toBe(1);
      expect(await f.forDelivery()).toMatchObject({
        subject: "Edited subject",
        body: "Edited body",
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a discarded draft can never be sent or delivered",
    async () => {
      const f = await succeededRun();
      await f.owner.mutation(api.automations.discardRunEmail, {
        runId: f.runId,
      });
      await expect(
        f.owner.mutation(api.automations.sendRunEmail, { runId: f.runId }),
      ).rejects.toThrow("no longer a draft");
      expect((await f.email())?.status).toBe("discarded");
      expect(await f.deliveries()).toBe(0);
      expect(await f.forDelivery()).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "auto-send skips review and delivers exactly once",
    async () => {
      const f = await succeededRun({ emailAutoSend: true });
      expect((await f.email())?.status).toBe("sent");
      expect(await f.deliveries()).toBe(1);
      expect(await f.forDelivery()).toMatchObject({
        subject: "Nightly audit #1",
      });
    },
    TIMEOUT_MS,
  );
});
