import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { normalizeAIModel } from "../validators";
import { isEntityDeleted } from "../numId";
import { ensureOwnerChat } from "../_sessions/ownedSession";
import { queueSystemChatMessage } from "../_sessions/execution";
import {
  coordinatorAutoTurnsInLastHour,
  MAX_COORDINATOR_AUTO_TURNS_PER_HOUR,
  undeliveredWakes,
} from "./coordinatorWake";

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

export type WakeDelivery = "none" | "sent" | "held";

/**
 * Delivers every undelivered wake-up of the project in one turn (rows the cap
 * held earlier ride along), or holds them at the cap. Nothing new to send
 * means no turn.
 */
export async function deliverPendingCoordinatorWakes(
  ctx: MutationCtx,
  projectId: Id<"projects">,
): Promise<WakeDelivery> {
  const pending = await undeliveredWakes(ctx.db, projectId);
  if (!pending.some((row) => row.heldAt === undefined)) return "none";
  const project = await ctx.db.get(projectId);
  const now = Date.now();
  if (!project || isEntityDeleted(project)) {
    for (const row of pending) await ctx.db.patch(row._id, { sentAt: now });
    return "none";
  }
  if (
    (await coordinatorAutoTurnsInLastHour(ctx.db, projectId, now)) >=
    MAX_COORDINATOR_AUTO_TURNS_PER_HOUR
  ) {
    for (const row of pending) {
      if (row.heldAt === undefined) await ctx.db.patch(row._id, { heldAt: now });
    }
    return "held";
  }
  const context = await ensureOwnerChat(ctx, { kind: "project", project });
  const repo = await ctx.db.get(context.session.repoId);
  await queueSystemChatMessage(ctx, {
    context,
    userId: project.userId,
    content: coordinatorWakeMessage(pending),
    settings: {
      // Decision 20: the coordinator runs on the project's model and account.
      model: normalizeAIModel(
        project.model ?? context.chat.lastModel ?? repo?.defaultModel,
      ),
      providerAccountId: project.providerAccountId,
    },
  });
  for (const row of pending) {
    await ctx.db.patch(row._id, { sentAt: now, heldAt: undefined });
  }
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

