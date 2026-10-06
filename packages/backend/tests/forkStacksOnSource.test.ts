import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * `createForkedSession` (fix #882): the fork stacks on the source — its base
 * is the source branch when that branch is on GitHub, else the source's own
 * base — and it never queues the old transcript as a `<forked_thread>` first
 * message, because the forked disk already holds the agent's conversation and
 * `copyForkMessages` copies the chat rows afterwards. The Plan tab and
 * interaction mode come along with the composer traits.
 */

const modules = import.meta.glob("../convex/**/*.ts");

/** Loading the whole convex module graph costs seconds on a cold worker. */
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|fork-stack";

async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const sourceId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "fork-stacks-on-source",
      installationId: 1,
      connectedBy: userId,
      defaultBaseBranch: "main",
    });
    const id = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Seed the invoices table",
      status: "closed",
      numId: 1,
      sandboxId: "sbx_source",
      baseBranch: "develop",
      branchName: "eva/session-source",
      lastModel: "claude:opus",
      planContent: "# Seed plan",
      lastInteractionMode: "plan",
    });
    await ctx.db.insert("messages", {
      parentId: id,
      role: "user",
      content: "Seed the invoices table",
      timestamp: 1_000,
      userId,
    });
    await ctx.db.insert("messages", {
      parentId: id,
      role: "assistant",
      content: "Seeded 12 invoices.",
      timestamp: 2_000,
    });
    return id;
  });
  return { t: t.withIdentity({ subject: CLERK_ID }), sourceId };
}

async function createFork(stackOnSource: boolean) {
  const { t, sourceId } = await fixture();
  const { sessionId } = await t.mutation(
    internal.sessions.createForkedSession,
    {
      sourceSessionId: sourceId,
      sourceSandboxId: "sbx_source",
      restartSource: false,
      stackOnSource,
    },
  );
  return await t.run(async (ctx) => ({
    sourceId,
    fork: await ctx.db.get(sessionId),
    messages: await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", sessionId))
      .collect(),
    queued: await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", sessionId))
      .collect(),
  }));
}

describe("createForkedSession", () => {
  test(
    "stacks on the source branch and carries no replayed first message",
    async () => {
      const { sourceId, fork, messages, queued } = await createFork(true);
      expect(fork).toMatchObject({
        baseBranch: "eva/session-source",
        forkedFromSessionId: sourceId,
        forkSourceSandboxId: "sbx_source",
        planContent: "# Seed plan",
        lastInteractionMode: "plan",
        lastModel: "claude:opus",
      });
      expect(fork?.branchName).not.toBe("eva/session-source");
      expect(queued).toEqual([]);
      expect(messages).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "falls back to the source's base when its branch is not on GitHub",
    async () => {
      const { fork, queued } = await createFork(false);
      expect(fork?.baseBranch).toBe("develop");
      expect(queued).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
