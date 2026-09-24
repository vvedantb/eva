import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

/**
 * Nothing watches the dev server or the navigation proxy after launch. An OOM
 * kill (observed in prod: the kernel killed next-server twice in one boot) or
 * a lazily-resumed VM leaves the app port dead while the sandbox runs, and the
 * readiness poll is the only thing that notices — it schedules
 * `ensureSessionPreviewServices`, which relaunches through the single Console
 * launcher.
 *
 * These tests run that action. Every guard it has is about NOT touching the
 * sandbox: a recovery racing the startup flow launched a duplicate server on
 * the wrong port in prod (13000 by startup, 3001 by recovery a second later),
 * and any exec on a stopped Vercel sandbox resumes it. So the observable
 * property is whether the action reaches the sandbox at all — with no Vercel
 * credentials configured here, the first provider call throws, and a clean
 * `null` means the guards bailed before it.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the sandbox module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const SANDBOX_ID = "sbx-preview-recovery-owners";
/** The port the failing readiness probe reports, i.e. the one recovery owns. */
const EXPECTED_PORT = 13000;
const DEV_COMMAND = "pnpm dev";

type Harness = ReturnType<typeof convexTest>;
/** Same four literals on sessions, quick tasks and project chats. */
type SandboxLifecycle = "active" | "starting" | "stopping" | "closed";
type OwnerState = {
  status: SandboxLifecycle;
  devPort?: number;
  devCommand?: string;
};

/** A healthy owner of a running preview: recovery should act on this one. */
const RECOVERABLE: OwnerState = {
  status: "active",
  devPort: EXPECTED_PORT,
  devCommand: DEV_COMMAND,
};

async function seedRepo(
  t: Harness,
): Promise<{ repoId: Id<"githubRepos">; userId: Id<"users"> }> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "clerk|preview-recovery-owners",
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "eva",
      name: "preview-recovery-owners-test",
      installationId: 1,
    });
    return { repoId, userId };
  });
}

async function seedSession(
  t: Harness,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
  owner: OwnerState,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Preview recovery",
      status: owner.status,
      sandboxId: SANDBOX_ID,
      devPort: owner.devPort,
      devCommand: owner.devCommand,
    });
  });
}

async function seedTask(
  t: Harness,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
  owner: OwnerState,
): Promise<void> {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("agentTasks", {
      repoId,
      title: "Preview recovery",
      status: "business_review",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      sandboxId: SANDBOX_ID,
      reviewTaskSandboxStatus: owner.status,
      devPort: owner.devPort,
      devCommand: owner.devCommand,
    });
  });
}

async function seedProject(
  t: Harness,
  repoId: Id<"githubRepos">,
  userId: Id<"users">,
  owner: OwnerState,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Preview recovery",
      phase: "in_progress",
      rawInput: "recover the preview",
      sandboxId: SANDBOX_ID,
      reviewProjectSandboxStatus: owner.status,
      devPort: owner.devPort,
      devCommand: owner.devCommand,
    });
  });
}

const SEED_BY_OWNER = {
  session: seedSession,
  task: seedTask,
  project: seedProject,
} as const;

type OwnerKind = keyof typeof SEED_BY_OWNER;

async function runRecovery(
  t: Harness,
  repoId: Id<"githubRepos">,
): Promise<null> {
  return t.action(internal.sandbox.ensureSessionPreviewServices, {
    sandboxId: SANDBOX_ID,
    repoId,
    expectedPort: EXPECTED_PORT,
  });
}

/** The action bailed on a guard: nothing was asked of the sandbox provider. */
async function expectStoodDown(
  t: Harness,
  repoId: Id<"githubRepos">,
): Promise<void> {
  expect(await runRecovery(t, repoId)).toBeNull();
}

/**
 * The action cleared every guard and went for the sandbox. Without provider
 * credentials that call throws, which is the only signal available here that
 * recovery would have relaunched. Matching the message keeps an unrelated
 * throw (a bad seed, a renamed field) from reading as success.
 */
async function expectReachedSandbox(
  t: Harness,
  repoId: Id<"githubRepos">,
): Promise<void> {
  await expect(runRecovery(t, repoId)).rejects.toThrow(
    /Vercel sandbox credentials missing/,
  );
}

describe("preview recovery only acts on an owner that is safe to relaunch", () => {
  test(
    "an unowned sandbox is left alone",
    async () => {
      const t = convexTest(schema, modules);
      const { repoId } = await seedRepo(t);
      await expectStoodDown(t, repoId);
    },
    TIMEOUT_MS,
  );

  describe.each<OwnerKind>(["session", "task", "project"])(
    "%s owner",
    (kind) => {
      const seed = SEED_BY_OWNER[kind];

      test(
        "a running preview on the probed port is recovered",
        async () => {
          const t = convexTest(schema, modules);
          const { repoId, userId } = await seedRepo(t);
          await seed(t, repoId, userId, RECOVERABLE);
          // Reads this owner's own status/devPort fields — a config mapped to
          // the wrong field would leave them undefined and stand down.
          await expectReachedSandbox(t, repoId);
        },
        TIMEOUT_MS,
      );

      test.each<{ why: string; owner: OwnerState }>([
        {
          // Startup owns the launch: it resolves the real port and starts the
          // dev server itself. Racing it duplicated the server in prod.
          why: "startup still owns the launch",
          owner: { ...RECOVERABLE, status: "starting" },
        },
        {
          why: "the sandbox is stopping",
          owner: { ...RECOVERABLE, status: "stopping" },
        },
        {
          why: "the sandbox is closed",
          owner: { ...RECOVERABLE, status: "closed" },
        },
        {
          // Multi-app repos preview secondary apps on their own ports; this
          // recovery only owns the primary dev server.
          why: "another app's port failed the probe",
          owner: { ...RECOVERABLE, devPort: 3001 },
        },
        {
          why: "no dev port is known yet",
          owner: { status: "active", devCommand: DEV_COMMAND },
        },
        {
          why: "no dev command is known yet",
          owner: { status: "active", devPort: EXPECTED_PORT },
        },
      ])("stands down when $why", async ({ owner }) => {
        const t = convexTest(schema, modules);
        const { repoId, userId } = await seedRepo(t);
        await seed(t, repoId, userId, owner);
        await expectStoodDown(t, repoId);
      });
    },
  );

  test(
    "the session owning a sandbox wins over a task or project row",
    async () => {
      const t = convexTest(schema, modules);
      const { repoId, userId } = await seedRepo(t);
      // Only the session is unsafe to relaunch. Standing down proves the
      // session was the owner consulted, not the recoverable task/project.
      await seedSession(t, repoId, userId, {
        ...RECOVERABLE,
        status: "starting",
      });
      await seedTask(t, repoId, userId, RECOVERABLE);
      await seedProject(t, repoId, userId, RECOVERABLE);
      await expectStoodDown(t, repoId);
    },
    TIMEOUT_MS,
  );

  test(
    "a task owner wins over a project row when no session owns the sandbox",
    async () => {
      const t = convexTest(schema, modules);
      const { repoId, userId } = await seedRepo(t);
      await seedTask(t, repoId, userId, {
        ...RECOVERABLE,
        status: "starting",
      });
      await seedProject(t, repoId, userId, RECOVERABLE);
      await expectStoodDown(t, repoId);
    },
    TIMEOUT_MS,
  );
});
