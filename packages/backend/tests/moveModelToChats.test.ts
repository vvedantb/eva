import { convexTest } from "convex-test";
import { describe, expect, test } from "bun:test";
import schema from "../convex/schema";
import { modules } from "./_helpers/convexModules";
import { moveTaskModelToChat } from "../convex/_migrations/moveModelToChats";
import { ensureWorkSession } from "../convex/_sessions/ownedSession";

/**
 * `moveModelToChats`: a task's stored model, traits and account move onto
 * its chat when the chat has no model yet, a chat with its own pick keeps it,
 * and the task's copies are cleared either way.
 */

const TIMEOUT_MS = 30_000;

describe("moveModelToChats", () => {
  test(
    "fills an empty chat from the task, keeps a chat's own pick, and clears the task",
    async () => {
      const t = convexTest(schema, modules);
      const result = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { clerkId: "clerk|move-model" });
        const repoId = await ctx.db.insert("githubRepos", {
          owner: "vvedantb",
          name: "move-model",
          installationId: 1,
          connectedBy: userId,
        });
        const insertTask = (title: string) =>
          ctx.db.insert("agentTasks", {
            repoId,
            title,
            status: "todo",
            createdAt: 0,
            updatedAt: 0,
            createdBy: userId,
            model: "claude:opus",
            reasoningLevel: "low",
          });
        const emptyId = await insertTask("Empty chat");
        const pickedId = await insertTask("Picked chat");
        const empty = await ctx.db.get(emptyId);
        const picked = await ctx.db.get(pickedId);
        if (!empty || !picked) throw new Error("tasks missing");
        const emptyChat = (await ensureWorkSession(ctx, { kind: "task", task: empty }, {})).mainChat;
        const pickedChat = (
          await ensureWorkSession(ctx, { kind: "task", task: picked }, { lastModel: "claude:sonnet" })
        ).mainChat;
        await moveTaskModelToChat(ctx, empty);
        await moveTaskModelToChat(ctx, picked);
        return {
          empty: await ctx.db.get(emptyChat._id),
          picked: await ctx.db.get(pickedChat._id),
          task: await ctx.db.get(emptyId),
        };
      });
      expect(result.empty).toMatchObject({ lastModel: "claude:opus", lastReasoningLevel: "low" });
      expect(result.picked?.lastModel).toBe("claude:sonnet");
      expect(result.picked?.lastReasoningLevel).toBeUndefined();
      expect(result.task?.model).toBeUndefined();
      expect(result.task?.reasoningLevel).toBeUndefined();
    },
    TIMEOUT_MS,
  );
});
