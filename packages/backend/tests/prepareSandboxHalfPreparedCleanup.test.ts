import type { WorkflowCtx } from "@convex-dev/workflow";
import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import type { Id } from "../convex/_generated/dataModel";
import { prepareSandboxSteps } from "../convex/_sandbox_runtime/prepareSandboxSteps";
import schema from "../convex/schema";
import { toWorkflowId } from "../convex/workflowManager";

/**
 * #1064: `prepareSandboxSteps` only hands the sandbox id back on success. When
 * a step after create threw (branch setup, seeded-runtime restore), the
 * ephemeral sandbox it had just made kept running, because no caller's
 * `finally` knew its id. It must delete that sandbox itself, and only that
 * one: a reused or entity-owned sandbox is not its to delete.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const FRESH_SANDBOX = "sbx_fresh";

type Fake = {
  step: WorkflowCtx;
  deleted: Array<{ sandboxId: string | undefined; repoId: string }>;
};

/** The action args this fake reads; every action it sees passes `repoId`. */
const actionArgs = z.object({
  repoId: z.string(),
  sandboxId: z.string().optional(),
  existingSandboxId: z.string().optional(),
});

/** A workflow step that runs every action at once and throws on `failOn`. */
function fakeStep(failOn: string, opts: { deleteFails?: boolean } = {}): Fake {
  const deleted: Fake["deleted"] = [];
  return {
    deleted,
    step: {
      workflowId: toWorkflowId("wf_1"),
      async runAction(action, ...rest) {
        const name = getFunctionName(action);
        if (name === failOn) throw new Error(`${name} failed`);
        const args = actionArgs.parse(rest[0]);
        switch (name) {
          case "sandbox:createOrResumeSandbox":
            return {
              sandboxId: args.existingSandboxId ?? FRESH_SANDBOX,
              resumeFellBack: false,
            };
          case "sandbox:startupCommandsMarkerExists":
            return true;
          case "sandbox:runBackgroundCommands":
            return { ran: false, commandCount: 0, errors: [] };
          case "sandbox:deleteSandbox":
            if (opts.deleteFails) throw new Error("delete failed");
            deleted.push({ sandboxId: args.sandboxId, repoId: args.repoId });
            return null;
          default:
            return null;
        }
      },
      // Progress writes only; their results are never read.
      async runMutation() {
        return null;
      },
      async runQuery() {
        throw new Error("prepareSandboxSteps runs no queries");
      },
      async runWorkflow() {
        throw new Error("prepareSandboxSteps runs no workflows");
      },
      async sleep() {},
      async awaitEvent() {
        throw new Error("prepareSandboxSteps awaits no events");
      },
    },
  };
}

let REPO_ID: Id<"githubRepos">;
let BASE_ARGS: {
  installationId: number;
  repoOwner: string;
  repoName: string;
  repoId: Id<"githubRepos">;
  streamingEntityId: string;
  branchName: string;
};

beforeEach(async () => {
  const t = convexTest(schema, modules);
  REPO_ID = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|prep" });
    return ctx.db.insert("githubRepos", {
      owner: "owner",
      name: "repo",
      installationId: 1,
      connectedBy: userId,
    });
  });
  BASE_ARGS = {
    installationId: 1,
    repoOwner: "owner",
    repoName: "repo",
    repoId: REPO_ID,
    streamingEntityId: "entity_1",
    branchName: "eva/task-1",
  };

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a half-prepared ephemeral sandbox is deleted", () => {
  test.each([
    "sandbox:setupSandboxBranch",
    "sandbox:restoreSeededRuntimeState",
    "sandbox:startupCommandsMarkerExists",
  ])("when %s throws after create", async (failOn) => {
    const fake = fakeStep(failOn);
    await expect(
      prepareSandboxSteps(fake.step, { ...BASE_ARGS, ephemeral: true }),
    ).rejects.toThrow(`${failOn} failed`);
    expect(fake.deleted).toEqual([
      { sandboxId: FRESH_SANDBOX, repoId: REPO_ID },
    ]);
  });

  test("a failed delete still surfaces the original error", async () => {
    const fake = fakeStep("sandbox:setupSandboxBranch", { deleteFails: true });
    await expect(
      prepareSandboxSteps(fake.step, { ...BASE_ARGS, ephemeral: true }),
    ).rejects.toThrow("sandbox:setupSandboxBranch failed");
  });
});

describe("sandboxes the prepare does not own are left alone", () => {
  test("a non-ephemeral sandbox belongs to its entity", async () => {
    const fake = fakeStep("sandbox:setupSandboxBranch");
    await expect(
      prepareSandboxSteps(fake.step, { ...BASE_ARGS, ephemeral: false }),
    ).rejects.toThrow();
    expect(fake.deleted).toEqual([]);
  });

  test("a reused sandbox is not deleted, even for an ephemeral run", async () => {
    const fake = fakeStep("sandbox:setupSandboxBranch");
    await expect(
      prepareSandboxSteps(fake.step, {
        ...BASE_ARGS,
        ephemeral: true,
        existingSandboxId: "sbx_existing",
      }),
    ).rejects.toThrow();
    expect(fake.deleted).toEqual([]);
  });

  test("a successful prepare returns the sandbox and deletes nothing", async () => {
    const fake = fakeStep("none");
    await expect(
      prepareSandboxSteps(fake.step, { ...BASE_ARGS, ephemeral: true }),
    ).resolves.toEqual({ sandboxId: FRESH_SANDBOX, resumeFellBack: false });
    expect(fake.deleted).toEqual([]);
  });
});
