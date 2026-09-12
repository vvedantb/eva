import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * Docs created from a sandbox token are stored against that session / task /
 * project so the chat Documents tab and the repo Documents sidebar share one
 * row. Plan → Save as document still uses `sessionId` (getBySession); MCP
 * create_eva_doc uses source* fields so it cannot steal the Plan save target.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const CLERK_ID = "clerk|doc-source";
const STRANGER_CLERK_ID = "clerk|doc-source-stranger";

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", { clerkId: CLERK_ID });
    const strangerUserId = await ctx.db.insert("users", {
      clerkId: STRANGER_CLERK_ID,
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
      title: "Build the documents tab",
      status: "active",
      numId: 76,
    });
    const taskId = await ctx.db.insert("agentTasks", {
      repoId,
      title: "Quick doc",
      status: "code_review",
      numId: 7,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    const projectId = await ctx.db.insert("projects", {
      repoId,
      userId,
      title: "Docs project",
      phase: "in_progress",
      rawInput: "docs",
      numId: 3,
      updatedAt: now,
    });
    const mcpDocId = await ctx.db.insert("docs", {
      repoId,
      title: "MCP design doc",
      content: "Generated in chat",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      numId: 1,
      sourceKind: "session",
      sourceSessionId: sessionId,
    });
    const planDocId = await ctx.db.insert("docs", {
      repoId,
      title: "Saved plan",
      content: "Plan markdown",
      createdBy: userId,
      createdAt: now - 1,
      updatedAt: now - 1,
      numId: 2,
      sessionId,
    });
    const unlinkedId = await ctx.db.insert("docs", {
      repoId,
      title: "Manual upload",
      content: "Typed in the sidebar",
      createdBy: userId,
      createdAt: now - 2,
      updatedAt: now - 2,
      numId: 3,
    });
    return {
      userId,
      strangerUserId,
      repoId,
      sessionId,
      taskId,
      projectId,
      mcpDocId,
      planDocId,
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

describe("doc source linkage", () => {
  test(
    "listForSource returns MCP docs and the session plan doc, not unlinked",
    async () => {
      const f = await fixture();
      const sessionRows = await f.asUser.query(api.docs.listForSource, {
        source: { kind: "session", sessionId: f.sessionId },
      });
      expect(sessionRows.map((row) => row._id)).toEqual([
        f.mcpDocId,
        f.planDocId,
      ]);
      expect(sessionRows[0]?.source).toMatchObject({
        kind: "session",
        title: "Build the documents tab",
        numId: 76,
        owner: "vvedantb",
        repo: "eva",
      });
      expect(sessionRows[1]?.source?.kind).toBe("session");

      expect(
        await f.asUser.query(api.docs.listForSource, {
          source: { kind: "task", taskId: f.taskId },
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "getBySession still returns only the plan-linked doc",
    async () => {
      const f = await fixture();
      const plan = await f.asUser.query(api.docs.getBySession, {
        sessionId: f.sessionId,
      });
      expect(plan?._id).toBe(f.planDocId);
    },
    TIMEOUT_MS,
  );

  test(
    "list still includes linked and unlinked docs with a source line",
    async () => {
      const f = await fixture();
      const all = await f.asUser.query(api.docs.list, { repoId: f.repoId });
      const byId = new Map(all.map((row) => [row._id, row]));
      expect(byId.get(f.mcpDocId)?.source?.kind).toBe("session");
      expect(byId.get(f.planDocId)?.source?.kind).toBe("session");
      expect(byId.get(f.unlinkedId)?.source).toBeNull();
    },
    TIMEOUT_MS,
  );

  test(
    "strangers cannot list another user's session documents",
    async () => {
      const f = await fixture();
      expect(
        await f.asStranger.query(api.docs.listForSource, {
          source: { kind: "session", sessionId: f.sessionId },
        }),
      ).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
