// TEMPORARY: mock data for web/mobile comparison screenshots. Copied in from /tmp/proof; never committed.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

export const seed = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const now = Date.now();
    const min = 60_000;
    const userId = await ctx.db.insert("users", {
      clerkId,
      email: "sam@example.com",
      fullName: "Sam Demo",
      onboardingCompletedAt: now,
      lastChangelogDismissedAt: now,
    });
    const teamId = await ctx.db.insert("teams", { name: "Acme", createdBy: userId, createdAt: now });
    await ctx.db.insert("teamMembers", { teamId, userId, role: "member", joinedAt: now });
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "acme",
      name: "storefront",
      label: "Storefront",
      installationId: 1,
      connectedBy: userId,
      teamId,
    });
    const sessions: Array<{ title: string; status: "active" | "closed"; ago: number; archived?: boolean }> = [
      { title: "Add dark mode to checkout", status: "active", ago: 4 },
      { title: "Fix flaky login test", status: "active", ago: 40 },
      { title: "Migrate product images to CDN", status: "closed", ago: 300 },
      { title: "Write onboarding docs", status: "closed", ago: 1800, archived: true },
    ];
    const chats: Array<{ sessionId: Id<"sessions">; chatId: Id<"sessionChats"> }> = [];
    for (const [index, s] of sessions.entries()) {
      const sessionId = await ctx.db.insert("sessions", {
        repoId,
        userId,
        title: s.title,
        status: s.status,
        numId: index + 1,
        updatedAt: now - s.ago * min,
        archived: s.archived,
      });
      const chatId = await ctx.db.insert("sessionChats", { sessionId, repoId, userId, title: "Main", number: 1, isMain: true });
      chats.push({ sessionId, chatId });
    }
    const [first, second, third] = chats;
    if (!first || !second || !third) return null;
    await ctx.db.insert("messages", {
      parentId: first.chatId,
      role: "user",
      content: "Add a dark mode toggle to the checkout page. Keep the brand colours.",
      userId,
      timestamp: now - 20 * min,
    });
    await ctx.db.insert("messages", {
      parentId: first.chatId,
      role: "assistant",
      timestamp: now - 15 * min,
      finishedAt: now - 14 * min,
      content:
        "Done. The checkout page now has a **dark mode** toggle.\n\n### What changed\n\n- Moved the colours to theme tokens in `theme.ts`\n- Added the toggle to the checkout header\n- The card fields read the tokens, so both themes keep the brand colours\n\n```ts\nexport const theme = { brand: \"#e4006d\" };\n```",
      activityLog: JSON.stringify([
        { type: "read", label: "Read file", detail: "src/checkout/Checkout.tsx", status: "complete" },
        { type: "read", label: "Read file", detail: "src/theme.ts", status: "complete" },
        { type: "edit", label: "Edited file", detail: "src/theme.ts", status: "complete" },
        { type: "bash", label: "Ran command", detail: "pnpm test checkout", status: "complete" },
      ]),
    });
    await ctx.db.insert("messages", {
      parentId: second.chatId,
      role: "user",
      content: "The login test fails about one run in five. Find out why and fix it.",
      userId,
      timestamp: now - 45 * min,
    });
    await ctx.db.insert("messages", {
      parentId: second.chatId,
      role: "assistant",
      content: "The test clicks Sign in before the form finishes loading. I can wait for the form, or mock the slow call.",
      timestamp: now - 41 * min,
    });
    await ctx.db.insert("turns", {
      entityId: second.chatId,
      sessionId: second.sessionId,
      streamingEntityId: String(second.chatId),
      state: "running",
      open: true,
      turnStartedAt: now - 41 * min,
      leaseExpiresAt: now + 120 * min,
      leaseGeneration: 1,
      model: "claude:sonnet",
      repoId,
    });
    await ctx.db.insert("pendingQuestions", {
      entityId: second.chatId,
      toolUseId: "proof-tool",
      createdAt: now - 40 * min,
      payload: JSON.stringify({
        questions: [
          {
            question: "How should I fix the flaky login test?",
            header: "Fix",
            multiSelect: false,
            options: [
              { label: "Wait for the form", description: "Wait until the form has loaded before clicking." },
              { label: "Mock the slow call", description: "Stub the slow request in the test." },
            ],
          },
        ],
      }),
    });
    const notify = async (
      title: string,
      type: "mention" | "routed_question" | "task_complete",
      ago: number,
      read: boolean,
      target: Id<"sessions">,
      contextLabel?: string,
    ) =>
      await ctx.db.insert("notifications", {
        userId,
        type,
        title,
        read,
        repoId,
        createdAt: now - ago * min,
        chatTarget: target,
        contextLabel,
        href: "/acme/storefront/sessions/1",
      });
    await notify("Task complete: Migrate product images to CDN", "task_complete", 300, true, third.sessionId);
    await notify("Alex Rivera mentioned you in a session chat", "mention", 90, false, first.sessionId, "Add dark mode to checkout");
    await notify("Eva has a question in Fix flaky login test", "routed_question", 40, false, second.sessionId, "How should I fix the flaky login test?");
    return null;
  },
});

export const cleanup = internalMutation({
  args: { clerkId: v.string() },
  returns: v.number(),
  handler: async (ctx, { clerkId }) => {
    let deleted = 0;
    const drop = async (id: Parameters<typeof ctx.db.delete>[0]) => {
      await ctx.db.delete(id);
      deleted += 1;
    };
    const user = await ctx.db.query("users").withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId)).first();
    if (!user) return 0;
    const repos = await ctx.db.query("githubRepos").withIndex("by_connected_by", (q) => q.eq("connectedBy", user._id)).collect();
    for (const repo of repos) {
      for (const turn of await ctx.db.query("turns").withIndex("by_repo_open", (q) => q.eq("repoId", repo._id).eq("open", true)).collect()) await drop(turn._id);
      for (const turn of await ctx.db.query("turns").withIndex("by_repo_open", (q) => q.eq("repoId", repo._id).eq("open", false)).collect()) await drop(turn._id);
      const sessions = await ctx.db.query("sessions").withIndex("by_repo", (q) => q.eq("repoId", repo._id)).collect();
      for (const session of sessions) {
        const chats = await ctx.db.query("sessionChats").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
        for (const chat of chats) {
          for (const m of await ctx.db.query("messages").withIndex("by_parent", (q) => q.eq("parentId", chat._id)).collect()) await drop(m._id);
          for (const p of await ctx.db.query("pendingQuestions").withIndex("by_entity", (q) => q.eq("entityId", chat._id)).collect()) await drop(p._id);
          await drop(chat._id);
        }
        await drop(session._id);
      }
      await drop(repo._id);
    }
    for (const n of await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await drop(n._id);
    for (const t of await ctx.db.query("pushTokens").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await drop(t._id);
    for (const m of await ctx.db.query("teamMembers").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await drop(m._id);
    for (const t of await ctx.db.query("teams").withIndex("by_created_by", (q) => q.eq("createdBy", user._id)).collect()) await drop(t._id);
    for (const p of await ctx.db.query("userPresence").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await drop(p._id);
    await drop(user._id);
    return deleted;
  },
});
