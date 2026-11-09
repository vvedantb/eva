// TEMPORARY (not committed): heavy sessions in the local dev repo for browser profiling.
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const SIZES = [2_000, 4_000, 6_000, 8_000, 9_000, 11_000, 16_000, 30_000, 60_000, 110_000];
const WORDS = ["refactor", "sandbox", "convex", "query", "index", "session", "preview", "deploy", "review", "branch", "commit", "agent", "schema", "migration"];
function filler(seed: number, length: number): string {
  const out: Array<string> = [];
  let size = 0;
  for (let i = 0; size < length; i++) { const w = WORDS[(seed * 7 + i * 13) % WORDS.length] ?? "eva"; out.push(w); size += w.length + 1; }
  return out.join(" ").slice(0, length);
}
function activityLog(seed: number, bytes: number): string {
  const steps: Array<string> = [];
  let size = 2;
  for (let i = 0; size < bytes; i++) {
    const path = `apps/web/src/lib/components/chat/File${(seed + i) % 97}.tsx`;
    const kind = i % 4;
    const step = kind === 0
      ? { type: "bash", label: "Running command...", detail: filler(seed + i, 120), command: filler(seed + i, 200), status: "complete", output: { text: filler(seed + i + 1, 700), exitCode: 0 } }
      : kind === 1 ? { type: "read", label: "Reading file...", detail: path, path, status: "complete" }
      : kind === 2 ? { type: "edit", label: "Editing file...", detail: path, path, status: "complete", edits: [{ oldText: filler(seed + i, 300), newText: filler(seed + i + 2, 300) }] }
      : { type: "thinking", label: "Thinking...", detail: filler(seed + i, 500), status: "complete" };
    const json = JSON.stringify(step);
    steps.push(json);
    size += json.length + 1;
  }
  return `[${steps.join(",")}]`;
}
function markdown(seed: number): string {
  return `## Result ${seed}\n\n${filler(seed, 300)}\n\n- ${filler(seed + 1, 80)}\n- ${filler(seed + 2, 80)}\n\n\`\`\`ts\nexport function f${seed}(x: number) {\n  return x * ${seed};\n}\n\`\`\`\n\n${filler(seed + 3, 400)}`;
}

export const createSession = internalMutation({
  args: { numId: v.number() },
  handler: async (ctx, { numId }) => {
    const repos = await ctx.db.query("githubRepos").collect();
    const repo = repos.find((r) => r.owner === "vvedantb" && r.name === "eva" && r.rootDirectory === "apps/web");
    if (!repo) throw new Error("repo not found: " + repos.filter((r) => r.owner === "vvedantb").map((r) => `${r.name}:${r.rootDirectory}`).join(","));
    const anySession = await ctx.db.query("sessions").withIndex("by_repo", (q) => q.eq("repoId", repo._id)).order("desc").first();
    if (!anySession) throw new Error("no session in repo");
    const sessionId = await ctx.db.insert("sessions", { repoId: repo._id, userId: anySession.userId, title: `LOADTEST heavy ${numId}`, status: "closed", numId, lastTurnFinishedAt: Date.now() });
    const chatId = await ctx.db.insert("sessionChats", { sessionId, repoId: repo._id, userId: anySession.userId, title: "Main", number: 1, isMain: true });
    return { sessionId, chatId };
  },
});

export const addMessages = internalMutation({
  args: { chatId: v.id("sessionChats"), start: v.number(), count: v.number() },
  handler: async (ctx, { chatId, start, count }) => {
    for (let i = start; i < start + count; i++) {
      const assistant = i % 2 === 1;
      await ctx.db.insert("messages", {
        parentId: chatId,
        role: assistant ? "assistant" : "user",
        content: assistant ? markdown(i) : filler(i, 300),
        timestamp: Date.now() - (100000 - i) * 1000,
        ...(assistant ? { activityLog: activityLog(i, SIZES[Math.floor(i / 2) % SIZES.length] ?? 8000), finishedAt: Date.now() - (100000 - i) * 1000 + 500 } : {}),
      });
    }
  },
});

export const cleanup = internalMutation({
  args: { sessionId: v.id("sessions"), chatId: v.id("sessionChats") },
  handler: async (ctx, { sessionId, chatId }) => {
    const batch = await ctx.db.query("messages").withIndex("by_parent", (q) => q.eq("parentId", chatId)).take(150);
    for (const m of batch) await ctx.db.delete(m._id);
    if (batch.length < 150) { await ctx.db.delete(chatId); await ctx.db.delete(sessionId); return true; }
    return false;
  },
});

export const touch = internalMutation({
  args: { chatId: v.id("sessionChats") },
  handler: async (ctx, { chatId }) => {
    const first = await ctx.db.query("messages").withIndex("by_parent", (q) => q.eq("parentId", chatId)).first();
    if (first) await ctx.db.patch(first._id, { timestamp: first.timestamp + 1 });
  },
});
