import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Artifacts created from a sandbox token are stored against that session /
 * task / project so the chat Artifacts tab and the global Artifacts page
 * share one row. These hit the real queries: a source-level index name
 * check would miss a list that still ranged over by_team.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|artifact-source";
const STRANGER_CLERK_ID = "clerk|artifact-source-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const strangerUserId = await ctx.db.insert("users", {
      clerkId: STRANGER_CLERK_ID,
    });
    const teamId = await ctx.db.insert("teams", {
      name: "Eva",
      createdBy: userId,
      createdAt: now,
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "member",
      joinedAt: now,
    });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: userId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId,
      title: "Build the artifacts tab",
      status: "active",
      numId: 42,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Quick artifact",
      status: "code_review",
      numId: 7,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Artifacts project",
      phase: "in_progress",
      rawInput: "artifacts",
      numId: 3,
      updatedAt: now,
    });
    const htmlStorageId = await ctx.storage.store(
      new Blob(["<html></html>"], { type: "text/html" }),
    );
    const sessionArtifactId = await ctx.db.insert("artifacts", {
      name: "Session dashboard",
      boundTeamId: teamId,
      declaredTools: [],
      htmlStorageId,
      uploadedBy: userId,
      createdAt: now,
      sourceKind: "session",
      sourceSessionId: sessionId,
    });
    const unlinkedId = await ctx.db.insert("artifacts", {
      name: "Manual upload",
      boundTeamId: teamId,
      declaredTools: [],
      htmlStorageId,
      uploadedBy: userId,
      createdAt: now - 1,
    });
    return {
      userId,
      strangerUserId,
      teamId,
      sessionId,
      taskId,
      projectId,
      sessionArtifactId,
      unlinkedId,
    };
  });
  return {
    t,
    asUser: t.withIdentity({ subject: CLERK_ID }),
    asStranger: t.withIdentity({ subject: STRANGER_CLERK_ID }),
    ...ids,
  };
}

describe("artifact source linkage", () => {
  test(
    "listForSource returns only artifacts created in that chat",
    async () => {
      const f = await fixture();
      const sessionRows = await f.asUser.query(api.artifacts.listForSource, {
        source: { kind: "session", sessionId: f.sessionId },
      });
      expect(sessionRows.map((row) => row._id)).toEqual([f.sessionArtifactId]);
      expect(sessionRows[0]?.source).toMatchObject({
        kind: "session",
        title: "Build the artifacts tab",
        numId: 42,
        owner: "vvedantb",
        repo: "eva",
      });

      expect(
        await f.asUser.query(api.artifacts.listForSource, {
          source: { kind: "task", taskId: f.taskId },
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "listAll still includes linked and unlinked artifacts",
    async () => {
      const f = await fixture();
      const all = await f.asUser.query(api.artifacts.listAll, {});
      expect(all.map((row) => row._id)).toEqual([
        f.sessionArtifactId,
        f.unlinkedId,
      ]);
      expect(all[0]?.source?.kind).toBe("session");
      expect(all[1]?.source).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "strangers cannot list another user's session artifacts",
    async () => {
      const f = await fixture();
      expect(
        await f.asStranger.query(api.artifacts.listForSource, {
          source: { kind: "session", sessionId: f.sessionId },
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
