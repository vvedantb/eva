import { v, type Infer } from "convex/values";
import { titleFromPrompt } from "@eva/shared";
import { internal } from "../_generated/api";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { ownedSessionOwnerValidator } from "../_sessions/owner";
import { mirrorOwnerIntoSession } from "../_sessions/ownedSession";

type TitledOwner = Infer<typeof ownedSessionOwnerValidator>;

/**
 * A new task's or project's title. An explicit one (an agent's) is kept. A
 * person's form sends only the prompt: the title is its first line
 * (`titleFromPrompt`) until `scheduleGeneratedTitle` replaces it. Throws when
 * there is neither.
 */
export function initialTitle(
  explicit: string | undefined,
  prompt: string | undefined,
): { title: string; generate: boolean } {
  const given = explicit?.trim();
  if (given) return { title: given, generate: false };
  const title = titleFromPrompt(prompt ?? "");
  if (!title) throw new Error("Describe the work first");
  return { title, generate: true };
}

/**
 * Writes a generated title in the background (`textGen.generateOwnerTitle`),
 * as a session's first message does. It lands only while the title is still
 * `fallbackTitle`, so a rename made in the meantime stays.
 */
export async function scheduleGeneratedTitle(
  ctx: MutationCtx,
  owner: TitledOwner,
  prompt: string,
  fallbackTitle: string,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.textGen.generateOwnerTitle, {
    owner,
    prompt,
    fallbackTitle,
  });
}

/** Applies a generated title while the owner still has its first-line title. */
export const applyGeneratedTitle = internalMutation({
  args: {
    owner: ownedSessionOwnerValidator,
    fallbackTitle: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.owner.kind === "task") {
      const task = await ctx.db.get(args.owner.taskId);
      if (!task || task.title !== args.fallbackTitle) return null;
      await ctx.db.patch(task._id, { title: args.title, updatedAt: Date.now() });
      await mirrorOwnerIntoSession(ctx, {
        kind: "task",
        task: { ...task, title: args.title },
      });
      return null;
    }
    const project = await ctx.db.get(args.owner.projectId);
    if (!project || project.title !== args.fallbackTitle) return null;
    // As `projects.update`, a title edit leaves `updatedAt` (activity) alone.
    await ctx.db.patch(project._id, { title: args.title });
    await mirrorOwnerIntoSession(ctx, {
      kind: "project",
      project: { ...project, title: args.title },
    });
    return null;
  },
});
