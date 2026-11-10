// TEMPORARY (not committed): many tasks and projects in the local dev repo for browser profiling.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
const WORDS = ["refactor", "sandbox", "convex", "query", "index", "session", "preview", "deploy", "review", "branch"];
const filler = (seed: number, n: number) => { const o: string[] = []; let s = 0; for (let i = 0; s < n; i++) { const w = WORDS[(seed * 7 + i * 13) % WORDS.length] ?? "x"; o.push(w); s += w.length + 1; } return o.join(" ").slice(0, n); };
const agents = (seed: number, t: number) => Array.from({ length: 5 }, (_, i) => ({ toolUseId: `toolu_lt_${seed}_${i}_xxxxxxxxxxxx`, taskId: `b${seed}${i}lt`, description: filler(seed + i, 60), status: "completed", startedAt: t + i, settledAt: t + i + 30000 }));
const STATUSES = ["todo", "in_progress", "code_review", "business_review", "done", "done", "done", "cancelled"] as const;
async function repoAndUser(ctx: any) {
  const repos = await ctx.db.query("githubRepos").collect();
  const repo = repos.find((r: any) => r.owner === "vvedantb" && r.name === "eva" && r.rootDirectory === "apps/web");
  const s = await ctx.db.query("sessions").withIndex("by_repo", (q: any) => q.eq("repoId", repo._id)).order("desc").first();
  return { repoId: repo._id, userId: s.userId };
}
export const seed = internalMutation({
  args: { start: v.number(), count: v.number(), projects: v.boolean() },
  handler: async (ctx, { start, count, projects }) => {
    const { repoId, userId } = await repoAndUser(ctx);
    const now = Date.now();
    for (let i = start; i < start + count; i++) {
      if (projects) {
        await ctx.db.insert("projects", { repoId, userId, title: `LTPROJ ${i}`, rawInput: filler(i, 340), description: filler(i, 150), phase: "in_progress", planningMode: "tasks_only", backgroundAgents: agents(i, now) });
      } else {
        await ctx.db.insert("agentTasks", { title: `LTTASK ${i} ${filler(i, 30)}`, description: filler(i, 460), createdAt: now - i * 60000, updatedAt: now - i * 60000, createdBy: userId, status: STATUSES[i % STATUSES.length] ?? "todo", repoId, numId: 900000 + i, backgroundAgents: agents(i, now) });
      }
    }
  },
});
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { repoId } = await repoAndUser(ctx);
    let n = 0;
    for (const t of await ctx.db.query("agentTasks").withIndex("by_repo", (q: any) => q.eq("repoId", repoId)).collect()) if (t.title.startsWith("LTTASK ")) { await ctx.db.delete(t._id); n++; }
    for (const p of await ctx.db.query("projects").withIndex("by_repo_and_deleted", (q: any) => q.eq("repoId", repoId)).collect()) if (p.title.startsWith("LTPROJ ")) { await ctx.db.delete(p._id); n++; }
    return n;
  },
});
