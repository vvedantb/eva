import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;
const ASK_CONTEXT =
  "We are shipping the Messages empty state. Need a call on illustration vs ghost so the list can land.";
const OWNER_CLERK = "clerk|routed-owner";
const DESIGNER_CLERK = "clerk|routed-designer";
const STRANGER_CLERK = "clerk|routed-stranger";

async function fixture(opts?: { personalTeam?: boolean }) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const ownerUserId = await ctx.db.insert("users", {
      clerkId: OWNER_CLERK,
      fullName: "Owen Owner",
      role: "dev",
    });
    const designerUserId = await ctx.db.insert("users", {
      clerkId: DESIGNER_CLERK,
      fullName: "Dana Designer",
      role: "designer",
    });
    const strangerUserId = await ctx.db.insert("users", {
      clerkId: STRANGER_CLERK,
      fullName: "Sam Stranger",
    });
    const teamId = await ctx.db.insert("teams", {
      name: opts?.personalTeam ? "Owen" : "Eva",
      createdBy: ownerUserId,
      createdAt: now,
      isPersonal: opts?.personalTeam === true,
    });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId: ownerUserId,
      role: "owner",
      joinedAt: now,
    });
    if (!opts?.personalTeam) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: designerUserId,
        role: "member",
        joinedAt: now,
      });
    }
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "vvedantb",
      name: "eva",
      installationId: 1,
      connectedBy: ownerUserId,
      teamId,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: ownerUserId,
      title: "Empty states",
      status: "active",
      numId: 9,
      lastModel: "claude:sonnet",
    });
    return {
      ownerUserId,
      designerUserId,
      strangerUserId,
      teamId,
      repoId,
      sessionId,
    };
  });
  return {
    t,
    asOwner: t.withIdentity({ subject: OWNER_CLERK }),
    asDesigner: t.withIdentity({ subject: DESIGNER_CLERK }),
    asStranger: t.withIdentity({ subject: STRANGER_CLERK }),
    ...ids,
  };
}

describe("work profiles", () => {
  test(
    "upsert writes a directory row Eva can list",
    async () => {
      const f = await fixture();
      await f.asDesigner.mutation(api.workProfiles.upsertMine, {
        role: "designer",
        headline: "Product designer",
        owns: "empty states",
        askMeAbout: "spacing copy",
      });
      const mine = await f.asDesigner.query(api.workProfiles.getMine, {});
      expect(mine.headline).toBe("Product designer");
      expect(mine.role).toBe("designer");

      const teams = await f.t.query(internal.workProfiles.listForAgent, {
        userId: f.ownerUserId,
      });
      expect(teams).toHaveLength(1);
      const dana = teams[0].members.find(
        (row) => row.userId === f.designerUserId,
      );
      expect(dana?.owns).toBe("empty states");
    },
    TIMEOUT_MS,
  );
});

describe("ask_teammate", () => {
  test(
    "creates a thread, notifies the assignee, and stubs the source chat",
    async () => {
      const f = await fixture();
      await f.asDesigner.mutation(api.workProfiles.upsertMine, {
        role: "designer",
        headline: "Designer",
        owns: "empty states",
        askMeAbout: "copy",
      });
      await f.t.run(async (ctx) => {
        await ctx.db.insert("messages", {
          role: "user",
          content: "Ship the empty state this week",
          timestamp: Date.now(),
          parentId: f.sessionId,
        });
      });
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Which empty-state illustration should we ship?",
        context: ASK_CONTEXT,
        topicKey: "empty-state-copy",
        role: "designer",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.assigneeUserId).toBe(f.designerUserId);
      expect(result.created).toBe(true);

      const mine = await f.asDesigner.query(api.routedThreads.listMine, {});
      expect(mine).toHaveLength(1);
      expect(mine[0].title).toContain("empty-state");

      const messages = await f.asDesigner.query(api.routedThreads.listMessages, {
        threadId: result.threadId,
      });
      expect(messages[0]?.authorKind).toBe("eva");
      expect(messages[0]?.context).toContain("Messages empty state");
      expect(messages[0]?.context).toContain("Session 9");
      expect(messages[0]?.context).toContain("Empty states");
      expect(messages[0]?.context).toContain("Owen Owner");
      expect(messages[0]?.context).toContain("Ship the empty state this week");

      const alerts = await f.t.run(async (ctx) => {
        return await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.sessionId))
          .collect();
      });
      expect(alerts.some((row) => row.isSystemAlert === true)).toBe(true);

      const notes = await f.asDesigner.query(api.notifications.list, {});
      expect(notes.some((row) => row.type === "routed_question")).toBe(true);
    },
    TIMEOUT_MS,
  );

  test(
    "appends to an open thread with the same topic",
    async () => {
      const f = await fixture();
      await f.asDesigner.mutation(api.workProfiles.upsertMine, {
        role: "designer",
        headline: "Designer",
        owns: "UI",
        askMeAbout: "design",
      });
      const first = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "First ask",
        context: ASK_CONTEXT,
        topicKey: "spacing",
        role: "designer",
      });
      const second = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Follow-up",
        context: ASK_CONTEXT,
        topicKey: "spacing",
        role: "designer",
      });
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.created).toBe(false);
      expect(second.threadId).toBe(first.threadId);
      const messages = await f.asOwner.query(api.routedThreads.listMessages, {
        threadId: first.threadId,
      });
      expect(messages).toHaveLength(2);
    },
    TIMEOUT_MS,
  );

  test(
    "skips personal teams",
    async () => {
      const f = await fixture({ personalTeam: true });
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Who decides this?",
        context: ASK_CONTEXT,
        topicKey: "decision",
        role: "designer",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Personal teams/i);
    },
    TIMEOUT_MS,
  );

  test(
    "rejects a question with no background",
    async () => {
      const f = await fixture();
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Which illustration?",
        context: "too short",
        topicKey: "no-context",
        role: "designer",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Context is too thin/i);
    },
    TIMEOUT_MS,
  );

  test(
    "lists candidates when two designers match",
    async () => {
      const f = await fixture();
      await f.t.run(async (ctx) => {
        const now = Date.now();
        const otherId = await ctx.db.insert("users", {
          clerkId: "clerk|routed-designer-2",
          fullName: "Other Designer",
          role: "designer",
        });
        await ctx.db.insert("teamMembers", {
          teamId: f.teamId,
          userId: otherId,
          role: "member",
          joinedAt: now,
        });
      });
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Totally unrelated topic xyz",
        context: ASK_CONTEXT,
        topicKey: "xyz",
        role: "designer",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.candidates?.length).toBeGreaterThan(1);
    },
    TIMEOUT_MS,
  );
});

describe("reply wakes the source", () => {
  test(
    "stores the reply and marks the thread waiting on Eva",
    async () => {
      const f = await fixture();
      await f.asDesigner.mutation(api.workProfiles.upsertMine, {
        role: "designer",
        headline: "Designer",
        owns: "UI",
        askMeAbout: "design",
      });
      const asked = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Use the ghost button?",
        context: ASK_CONTEXT,
        topicKey: "ghost-button",
        role: "designer",
      });
      expect(asked.ok).toBe(true);
      if (!asked.ok) return;

      await f.asDesigner.mutation(api.routedThreads.reply, {
        threadId: asked.threadId,
        body: "Yes — ghost on the empty state.",
      });
      const thread = await f.asDesigner.query(api.routedThreads.get, {
        id: asked.threadId,
      });
      expect(thread?.status).toBe("waiting_eva");

      const messages = await f.asDesigner.query(api.routedThreads.listMessages, {
        threadId: asked.threadId,
      });
      expect(messages.some((row) => row.body.includes("ghost"))).toBe(true);

      await expect(
        f.asStranger.mutation(api.routedThreads.reply, {
          threadId: asked.threadId,
          body: "nope",
        }),
      ).rejects.toThrow();
    },
    TIMEOUT_MS,
  );
});
