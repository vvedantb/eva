import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";


const TIMEOUT_MS = 30_000;
const SANDBOX_ID = "sbx-preview-recovery-owners";
const EXPECTED_PORT = 13000;
const DEV_COMMAND = "pnpm dev";

type Harness = ReturnType<typeof convexTest>;
type SandboxLifecycle = "active" | "starting" | "stopping" | "closed";
type OwnerState = {
  status: SandboxLifecycle;
  devPort?: number;
  devCommand?: string;
};

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
      owner: { kind: "standalone" },
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

async function expectStoodDown(
  t: Harness,
  repoId: Id<"githubRepos">,
): Promise<void> {
  expect(await runRecovery(t, repoId)).toBeNull();
}

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

  describe(
    "session owner (a task's or project's sandbox is its session's)",
    () => {
      const seed = seedSession;

      test(
        "a running preview on the probed port is recovered",
        async () => {
          const t = convexTest(schema, modules);
          const { repoId, userId } = await seedRepo(t);
          await seed(t, repoId, userId, RECOVERABLE);
          await expectReachedSandbox(t, repoId);
        },
        TIMEOUT_MS,
      );

      test.each<{ why: string; owner: OwnerState }>([
        {
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
});
