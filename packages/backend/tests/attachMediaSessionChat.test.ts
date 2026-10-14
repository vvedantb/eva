import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Session turns write their transcript under a `sessionChats` id, and the
 * sandbox callback sends that id to `attachMedia`. The action's validator once
 * accepted only session/project/task ids, so every session screenshot and
 * recording was rejected and never reached the chat message.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|attach-media-session-chat";

describe("attachMedia", () => {
  test(
    "attaches media to a message parented by a session chat",
    async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
        const repoId = await ctx.db.insert("githubRepos", {
          owner: "vvedantb",
          name: "eva",
          installationId: 1,
          connectedBy: userId,
        });
        const sessionId = await ctx.db.insert("sessions", {
          repoId,
          userId,
          title: "Screenshots",
          status: "active",
          numId: 1,
        });
        const chatId = await ctx.db.insert("sessionChats", {
          sessionId,
          repoId,
          userId,
          title: "Chat 2",
          number: 2,
          isMain: false,
        });
        const messageId = await ctx.db.insert("messages", {
          parentId: chatId,
          role: "assistant",
          content: "Took a screenshot.",
          timestamp: 1_000,
        });
        const storageId = await ctx.storage.store(new Blob(["png"]));
        return { chatId, messageId, storageId };
      });

      await t
        .withIdentity({ subject: CLERK_ID })
        .action(api.screenshots.attachMedia, {
          parentId: ids.chatId,
          messageId: ids.messageId,
          mediaStorageIds: [ids.storageId],
        });

      const message = await t.run((ctx) => ctx.db.get(ids.messageId));
      expect(message?.mediaStorageIds).toEqual([ids.storageId]);
    },
    TIMEOUT_MS,
  );
});
