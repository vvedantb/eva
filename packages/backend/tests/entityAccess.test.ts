import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Entry points that load a doc, project or message parent by ID must check
 * repo access before they write or start work. A signed-in user with no
 * access to the repo gets "Not authorized" and nothing changes.
 */

const modules = import.meta.glob("../convex/**/*.ts");

const OWNER = "clerk|entity-owner";
const STRANGER = "clerk|entity-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", { clerkId: OWNER });
    const strangerUserId = await ctx.db.insert("users", { clerkId: STRANGER });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
    });
    const otherRepoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "other",
      installationId: 1,
      connectedBy: strangerUserId,
    });
    const docId = await ctx.db.insert("docs", {
      repoId,
      title: "Spec",
      content: "Original",
      createdAt: 1,
      updatedAt: 1,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId: ownerUserId,
      title: "Project",
      rawInput: "Project",
      phase: "draft",
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Session",
      status: "active",
    });
    const messageId = await ctx.db.insert("messages", {
      parentId: sessionId,
      role: "assistant",
      content: "Done",
      timestamp: 1,
    });
    const storageId = await ctx.storage.store(new Blob(["png"]));
    const ownerTaskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Owner task",
      status: "todo",
      createdAt: 1,
      updatedAt: 1,
      createdBy: ownerUserId,
    });
    const strangerTaskId = await ctx.db.insert("agentTasks", {
      repoId: otherRepoId,
      title: "Stranger task",
      status: "todo",
      createdAt: 1,
      updatedAt: 1,
      createdBy: strangerUserId,
    });
    return {
      strangerUserId,
      repoId,
      otherRepoId,
      docId,
      projectId,
      sessionId,
      messageId,
      storageId,
      ownerTaskId,
      strangerTaskId,
    };
  });
  return {
    t,
    owner: t.withIdentity({ subject: OWNER }),
    stranger: t.withIdentity({ subject: STRANGER }),
    ...ids,
  };
}

describe("entity access on write paths", () => {
  test("docs.update rejects a user without repo access", async () => {
    const f = await fixture();
    await expect(
      f.stranger.mutation(api.docs.update, { id: f.docId, title: "Hijack" }),
    ).rejects.toThrow("Not authorized");
    await f.owner.mutation(api.docs.update, { id: f.docId, title: "Renamed" });
    const doc = await f.t.run((ctx) => ctx.db.get(f.docId));
    expect(doc?.title).toBe("Renamed");
  });

  test("doc workflows reject a user without repo access", async () => {
    const f = await fixture();
    await expect(
      f.stranger.mutation(api.docInterviewWorkflow.startInterview, {
        docId: f.docId,
        docTitle: "Spec",
        previousAnswers: [],
      }),
    ).rejects.toThrow("Not authorized");
    await expect(
      f.stranger.mutation(api.testGenWorkflow.startTestGen, { docId: f.docId }),
    ).rejects.toThrow("Not authorized");
  });

  test("projectInterviewWorkflow.startInterview rejects a user without repo access", async () => {
    const f = await fixture();
    await expect(
      f.stranger.mutation(api.projectInterviewWorkflow.startInterview, {
        projectId: f.projectId,
        featureDescription: "Add billing",
        previousAnswers: [],
      }),
    ).rejects.toThrow("Not authorized");
  });

  test("attachMediaInternal rejects a user without parent access", async () => {
    const f = await fixture();
    await expect(
      f.t.mutation(internal.messages.attachMediaInternal, {
        userId: f.strangerUserId,
        parentId: f.sessionId,
        messageId: f.messageId,
        mediaStorageIds: [f.storageId],
      }),
    ).rejects.toThrow("Not authorized");
    const message = await f.t.run((ctx) => ctx.db.get(f.messageId));
    expect(message?.mediaStorageIds).toBeUndefined();
  });

  test("projects.createFromTasks rejects tasks from another repo", async () => {
    const f = await fixture();
    await expect(
      f.owner.mutation(api.projects.createFromTasks, {
        repoId: f.repoId,
        title: "Grouped",
        taskIds: [f.ownerTaskId, f.strangerTaskId],
      }),
    ).rejects.toThrow("Task does not belong to this repository");
    const owned = await f.t.run((ctx) => ctx.db.get(f.ownerTaskId));
    expect(owned?.projectId).toBeUndefined();
  });
});
