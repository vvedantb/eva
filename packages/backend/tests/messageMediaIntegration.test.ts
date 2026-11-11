import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("message media targeting", () => {
  test("an exact target cannot attach synthetic media to a newer message", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "eva",
        name: "message-media-test",
        installationId: 1,
      });
      const sessionId = await ctx.db.insert("sessions", {
        owner: { kind: "standalone" },
        repoId,
        userId,
        title: "Media target test",
        status: "active",
      });
      const targetMessageId = await ctx.db.insert("messages", {
        parentId: sessionId,
        role: "assistant",
        content: "synthetic result",
        timestamp: 1,
      });
      const newerMessageId = await ctx.db.insert("messages", {
        parentId: sessionId,
        role: "assistant",
        content: "newer queued turn",
        timestamp: 2,
      });
      const mediaStorageId = await ctx.storage.store(
        new Blob(["image"], { type: "image/png" }),
      );
      return {
        sessionId,
        targetMessageId,
        newerMessageId,
        mediaStorageId,
      };
    });

    await t.mutation(internal.messages.updateLastInternal, {
      parentId: ids.sessionId,
      messageId: ids.targetMessageId,
      mediaStorageIds: [ids.mediaStorageId],
    });

    const messages = await t.run(async (ctx) => ({
      target: await ctx.db.get(ids.targetMessageId),
      newer: await ctx.db.get(ids.newerMessageId),
    }));
    expect(messages.target?.mediaStorageIds).toEqual([ids.mediaStorageId]);
    expect(messages.newer?.mediaStorageIds).toBeUndefined();
  });

  test("an exact message id cannot cross its declared parent", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      const repoId = await ctx.db.insert("githubRepos", {
        owner: "eva",
        name: "message-media-parent-test",
        installationId: 1,
      });
      const firstSessionId = await ctx.db.insert("sessions", {
        owner: { kind: "standalone" },
        repoId,
        userId,
        title: "First parent",
        status: "active",
      });
      const secondSessionId = await ctx.db.insert("sessions", {
        owner: { kind: "standalone" },
        repoId,
        userId,
        title: "Second parent",
        status: "active",
      });
      const targetMessageId = await ctx.db.insert("messages", {
        parentId: firstSessionId,
        role: "assistant",
        content: "first parent message",
        timestamp: 1,
      });
      const mediaStorageId = await ctx.storage.store(
        new Blob(["image"], { type: "image/png" }),
      );
      return { secondSessionId, targetMessageId, mediaStorageId };
    });

    await t.mutation(internal.messages.updateLastInternal, {
      parentId: ids.secondSessionId,
      messageId: ids.targetMessageId,
      mediaStorageIds: [ids.mediaStorageId],
    });

    const target = await t.run(
      async (ctx) => await ctx.db.get(ids.targetMessageId),
    );
    expect(target?.mediaStorageIds).toBeUndefined();
  });
});
