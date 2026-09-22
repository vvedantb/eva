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
const DESIGNER_2_CLERK = "clerk|routed-designer-2";
const STRANGER_CLERK = "clerk|routed-stranger";

/**
 * `personalTeam` only flips the `isPersonal` flag; `soloTeam` is what decides
 * whether anyone else is on the team. They are separate because production has
 * personal-flagged teams with several members.
 */
async function fixture(opts?: { personalTeam?: boolean; soloTeam?: boolean }) {
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
    if (!opts?.soloTeam) {
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

/** A second designer, so `role: "designer"` resolves to a group. */
async function addSecondDesigner(f: Awaited<ReturnType<typeof fixture>>) {
  const userId = await f.t.run(async (ctx) => {
    const id = await ctx.db.insert("users", {
      clerkId: DESIGNER_2_CLERK,
      fullName: "Sam Second",
      role: "designer",
    });
    await ctx.db.insert("teamMembers", {
      teamId: f.teamId,
      userId: id,
      role: "member",
      joinedAt: Date.now(),
    });
    return id;
  });
  return { userId, as: f.t.withIdentity({ subject: DESIGNER_2_CLERK }) };
}

/**
 * Wake payloads queued for the source chat. Only readable while the session is
 * mid-turn: once the queue drains, the chat keeps `displayContent` instead.
 */
async function queuedWakes(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.t.run(async (ctx) => {
    const rows = await ctx.db.query("queuedMessages").collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows.map((row) => row.content);
  });
}

/** Pins the session mid-turn so replies stay queued instead of draining. */
async function markSessionBusy(f: Awaited<ReturnType<typeof fixture>>) {
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.sessionId, { activeWorkflowId: "wf-test" });
  });
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
    "creates a thread, notifies the participant, and stubs the source chat",
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
      expect(result.participants.map((row) => row.userId)).toEqual([
        f.designerUserId,
      ]);
      expect(result.created).toBe(true);

      const mine = await f.asDesigner.query(api.routedThreads.listMine, {});
      expect(mine).toHaveLength(1);
      expect(mine[0].title).toContain("empty-state");
      expect(mine[0].needsMyReply).toBe(true);
      expect(mine[0].participants).toHaveLength(1);

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
    "refuses when the actor is the only person on the team",
    async () => {
      const f = await fixture({ personalTeam: true, soloTeam: true });
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
      expect(result.error).toMatch(/Nobody else is on this team/i);
    },
    TIMEOUT_MS,
  );

  test(
    "routes on a personal-flagged team that has other members",
    async () => {
      // Production shape: the team people actually work in is `isPersonal` and
      // has five members, so the flag must not block routing.
      const f = await fixture({ personalTeam: true });
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Which empty-state illustration should we ship?",
        context: ASK_CONTEXT,
        topicKey: "personal-team-routing",
        role: "designer",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.participants.map((row) => row.userId)).toEqual([
        f.designerUserId,
      ]);

      const teams = await f.t.query(internal.workProfiles.listForAgent, {
        userId: f.ownerUserId,
      });
      expect(teams).toHaveLength(1);
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
    "asks every designer when the role matches two people",
    async () => {
      const f = await fixture();
      const second = await addSecondDesigner(f);
      const result = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Totally unrelated topic xyz",
        context: ASK_CONTEXT,
        topicKey: "xyz",
        role: "designer",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.participants.map((row) => row.userId).sort()).toEqual(
        [f.designerUserId, second.userId].sort(),
      );

      const threads = await f.t.run(async (ctx) => {
        return await ctx.db.query("routedThreads").collect();
      });
      expect(threads).toHaveLength(1);

      const alerts = await f.t.run(async (ctx) => {
        return await ctx.db
          .query("messages")
          .withIndex("by_parent", (q) => q.eq("parentId", f.sessionId))
          .collect();
      });
      expect(
        alerts.some((row) => row.content.includes("Dana Designer, Sam Second")),
      ).toBe(true);

      for (const viewer of [f.asDesigner, second.as]) {
        expect(await viewer.query(api.routedThreads.countWaitingForMe, {})).toBe(
          1,
        );
      }
    },
    TIMEOUT_MS,
  );

  test(
    "a second ask on the same topic unions in an extra person",
    async () => {
      const f = await fixture();
      const second = await addSecondDesigner(f);
      const first = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Ghost or outline?",
        context: ASK_CONTEXT,
        topicKey: "buttons",
        assigneeUserIds: [f.designerUserId],
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.participants).toHaveLength(1);

      const again = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Sam, same question",
        context: ASK_CONTEXT,
        topicKey: "buttons",
        assigneeUserIds: [second.userId],
      });
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.created).toBe(false);
      expect(again.threadId).toBe(first.threadId);
      expect(again.participants.map((row) => row.name)).toEqual([
        "Dana Designer",
        "Sam Second",
      ]);

      const threads = await f.t.run(async (ctx) => {
        return await ctx.db.query("routedThreads").collect();
      });
      expect(threads).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "refuses to route a question back to the person asking it",
    async () => {
      const f = await fixture();
      const result = await f.asDesigner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Which illustration?",
        context: ASK_CONTEXT,
        topicKey: "self-ask",
        role: "designer",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/only match/i);
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

  test(
    "one reply clears only that participant and names who is outstanding",
    async () => {
      const f = await fixture();
      const second = await addSecondDesigner(f);
      const asked = await f.asOwner.mutation(api.routedThreads.ask, {
        sourceKind: "session",
        sourceId: f.sessionId,
        question: "Ghost or outline on the empty state?",
        context: ASK_CONTEXT,
        topicKey: "ghost-button",
        role: "designer",
      });
      expect(asked.ok).toBe(true);
      if (!asked.ok) return;
      expect(await f.asDesigner.query(api.routedThreads.countWaitingForMe, {}))
        .toBe(1);
      await markSessionBusy(f);

      await f.asDesigner.mutation(api.routedThreads.reply, {
        threadId: asked.threadId,
        body: "Ghost, with the outline reserved for destructive actions.",
      });

      const thread = await f.asDesigner.query(api.routedThreads.get, {
        id: asked.threadId,
      });
      expect(thread?.status).toBe("waiting_eva");
      expect(thread?.needsMyReply).toBe(false);
      expect(thread?.participants).toEqual([
        { userId: f.designerUserId, name: "Dana Designer", needsReply: false },
        { userId: second.userId, name: "Sam Second", needsReply: true },
      ]);
      expect(await f.asDesigner.query(api.routedThreads.countWaitingForMe, {}))
        .toBe(0);
      expect(await second.as.query(api.routedThreads.countWaitingForMe, {}))
        .toBe(1);

      const firstWake = await queuedWakes(f);
      expect(firstWake).toHaveLength(1);
      expect(firstWake[0]).toContain("Routed reply from Dana Designer");
      expect(firstWake[0]).toContain("Still waiting on: Sam Second.");

      await second.as.mutation(api.routedThreads.reply, {
        threadId: asked.threadId,
        body: "Agreed, ghost.",
      });
      const wakes = await queuedWakes(f);
      expect(wakes).toHaveLength(2);
      expect(wakes[1]).toContain("Everyone asked has now replied.");
      expect(await second.as.query(api.routedThreads.countWaitingForMe, {}))
        .toBe(0);
    },
    TIMEOUT_MS,
  );
});
