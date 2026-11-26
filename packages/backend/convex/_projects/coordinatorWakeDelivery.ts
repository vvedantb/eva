import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { normalizeAIModel } from "../validators";
import { isEntityArchived } from "../numId";
import { ensureOwnerChat } from "../_sessions/ownedSession";
import { queueSystemChatMessage } from "../_sessions/execution";
import { undeliveredWakes } from "./coordinatorWake";

// The delivery half of the coordinator's wake-ups (`coordinatorWake.ts`).
// Apart because it sends through the chat queue (`_sessions/execution.ts`),
// whose import graph the scheduler and the prompt builder must not load.

/** The message one delivery puts in the coordinator chat. */
export function coordinatorWakeMessage(
  rows: ReadonlyArray<Pick<Doc<"projectCoordinatorWakes">, "text">>,
): string {
  return [
    "[project-update] Automatic turn. Since your last turn:",
    ...rows.map((row) => `- ${row.text}`),
    "Read the task table above, act on these, then update the project summary with update_project_summary if it changed. Do not message tasks that do not need it.",
  ].join("\n");
}

export type WakeDelivery = "none" | "sent";

/**
 * Delivers every undelivered wake-up of the project in one turn. Nothing to
 * send means no turn. Each turn logs one `coordinator_wake` line (project and
 * reasons), so the turn rate is measured before any cap is set.
 */
export async function deliverPendingCoordinatorWakes(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<WakeDelivery> {
  const pending = await undeliveredWakes(ctx.db, projectId);
  if (pending.length === 0) return "none";
  const project = await ctx.db.get(projectId);
  const now = Date.now();
  if (!project || isEntityArchived(project)) {
    for (const row of pending) await ctx.db.patch(row._id, { sentAt: now });
    return "none";
  }
  const context = await ensureOwnerChat(ctx, { kind: "project", project });
  const repo = await ctx.db.get(context.session.repoId);
  await queueSystemChatMessage(ctx, {
    context,
    userId: project.userId,
    content: coordinatorWakeMessage(pending),
    // Eva runs on her chat's model and account, the ones picked in her
    // composer, so a wake runs on the same model as a turn you start. Her
    // tasks take the same model (`runSettings.ts`).
    settings:
      context.chat.lastModel !== undefined
        ? {
            model: normalizeAIModel(context.chat.lastModel),
            providerAccountId: context.chat.providerAccountId,
          }
        : {
            model: normalizeAIModel(project.model ?? repo?.defaultModel),
            providerAccountId: project.providerAccountId,
          },
  });
  for (const row of pending) await ctx.db.patch(row._id, { sentAt: now });
  console.log(
    `coordinator_wake project=${projectId} reasons=${pending.map((row) => row.reason).join(",")}`,
  );
  return "sent";
}

/** Scheduled by `requestCoordinatorWake`. A second run finds nothing to send. */
export const deliverCoordinatorWakes = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deliverPendingCoordinatorWakes(ctx, args.projectId);
    return null;
  },
});

