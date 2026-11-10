import {
  TURN_CONTINUE_DISPLAY,
  TURN_CONTINUE_PROMPT,
  TURN_MAX_RUNTIME_ERROR,
} from "@eva/shared/agentTurnLimits";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { queueRuntimeContinue } from "../convex/_chat/runtimeContinue";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

/** A task chat whose newest turn is `prompt` → `reply`; returns its queue after one continue pass. */
async function queueAfterTurn(prompt: string, reply: string, passes = 1) {
  const t = convexTest(schema, modules);
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { clerkId: "clerk|runner" });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      title: "Long load test",
      status: "code_review",
      repoId,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    await ctx.db.insert("messages", {
      parentId: taskId,
      role: "user",
      content: prompt,
      timestamp: now - 2,
      userId,
      model: "claude:opus",
    });
    await ctx.db.insert("messages", {
      parentId: taskId,
      role: "assistant",
      content: reply,
      timestamp: now - 1,
    });
    for (let pass = 0; pass < passes; pass++) {
      await queueRuntimeContinue(ctx, taskId, { lastUse1mContext: true });
    }
    return await ctx.db
      .query("queuedMessages")
      .withIndex("by_parent_and_order", (q) => q.eq("parentId", taskId))
      .collect();
  });
}

describe("queueRuntimeContinue", () => {
  test(
    "queues one continue with the chat's model and traits after a runtime-cap failure",
    async () => {
      const queue = await queueAfterTurn(
        "Run the load test",
        `Error: ${TURN_MAX_RUNTIME_ERROR}`,
        2,
      );
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        content: TURN_CONTINUE_PROMPT,
        displayContent: TURN_CONTINUE_DISPLAY,
        model: "claude:opus",
        use1mContext: true,
      });
    },
    TIMEOUT_MS,
  );

  test(
    "stops after one continue, and ignores other failures",
    async () => {
      expect(
        await queueAfterTurn(
          TURN_CONTINUE_DISPLAY,
          `Error: ${TURN_MAX_RUNTIME_ERROR}`,
        ),
      ).toHaveLength(0);
      expect(
        await queueAfterTurn(
          "Run the load test",
          "Error: The assistant stopped responding. Please try again.",
        ),
      ).toHaveLength(0);
    },
    TIMEOUT_MS,
  );
});
