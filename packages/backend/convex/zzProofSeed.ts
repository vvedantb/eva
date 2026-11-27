// TEMPORARY: screenshot seed for the View PRs chip. Never commit.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const seed = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = (await ctx.db.query("users").collect()).find(
      (u) => u.email === email,
    );
    if (!user) throw new Error("no user");
    await ctx.db.patch(user._id, {
      experimentalFlags: { ...user.experimentalFlags, viewPrsChip: true },
    });
    const now = Date.now();
    const repoId = await ctx.db.insert("githubRepos", {
      owner: "acme",
      name: "web",
      installationId: 1,
      connectedBy: user._id,
    });
    const sessionId = await ctx.db.insert("sessions", {
      repoId,
      userId: user._id,
      title: "Add pricing page",
      status: "closed",
      owner: { kind: "standalone" },
      numId: 1,
    });
    await ctx.db.insert("sessionChats", {
      sessionId,
      repoId,
      userId: user._id,
    });
    const prs = [
      { n: 41, title: "Add pricing page", state: "open" as const, primary: true },
      { n: 42, title: "Pricing page copy fixes", state: "draft" as const, primary: false },
    ];
    for (const pr of prs) {
      await ctx.db.insert("pullRequests", {
        repoId,
        prUrl: `https://github.com/acme/web/pull/${pr.n}`,
        prNumber: pr.n,
        title: pr.title,
        state: pr.state,
        primary: pr.primary,
        origin: "eva",
        owner: { kind: "session", sessionId },
        createdAt: now,
        updatedAt: now,
      });
    }
    return { repoId, sessionId };
  },
});

export const cleanup = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    for (const t of ["pullRequests", "sessionChats", "sessions", "githubRepos"] as const) {
      for (const row of await ctx.db.query(t).collect()) await ctx.db.delete(row._id);
    }
    const user = (await ctx.db.query("users").collect()).find(
      (u) => u.email === email,
    );
    if (user) {
      await ctx.db.patch(user._id, {
        experimentalFlags: { ...user.experimentalFlags, viewPrsChip: undefined },
      });
    }
  },
});
