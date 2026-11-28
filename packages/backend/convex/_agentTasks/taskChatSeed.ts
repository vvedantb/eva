import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  normalizeAIModel,
  type aiModelValidator,
  type reasoningLevelValidator,
} from "../validators";
import {
  assertProviderAccountUsableBy,
  resolveDefaultProviderAccountId,
} from "../_userProviderAccounts/defaults";
import { chatSeedFields, ensureWorkSession } from "../_sessions/ownedSession";

/** What a new task's form or caller picked; each absent field is the repo's default. */
export type NewTaskPicks = {
  projectId?: Id<"projects">;
  model?: Infer<typeof aiModelValidator>;
  providerAccountId?: Id<"userProviderAccounts"> | null;
  reasoningLevel?: Infer<typeof reasoningLevelValidator>;
  thinkingEnabled?: boolean;
  use1mContext?: boolean;
  fastMode?: boolean;
};

/**
 * A new task's model, traits and account go on its chat, the one place they
 * live. A quick task's chat is made now, on the picks or the repo's defaults
 * and the creator's default account. A project task's chat is made on first
 * need from Eva's (`chatSeedSettings`), unless the caller picked a model.
 */
export async function seedNewTaskChat(
  ctx: MutationCtx & { userId: Id<"users"> },
  taskId: Id<"agentTasks">,
  repo: Doc<"githubRepos">,
  picks: NewTaskPicks,
): Promise<void> {
  if (picks.projectId !== undefined && picks.model === undefined) return;
  const model = normalizeAIModel(picks.model ?? repo.defaultModel);
  const [task, providerAccountId] = await Promise.all([
    ctx.db.get(taskId),
    picks.providerAccountId === undefined
      ? resolveDefaultProviderAccountId(ctx.db, ctx.userId, model)
      : assertProviderAccountUsableBy(
          ctx.db,
          picks.providerAccountId,
          ctx.userId,
        ),
  ]);
  if (!task) return;
  await ensureWorkSession(
    ctx,
    { kind: "task", task },
    chatSeedFields({
      model,
      providerAccountId,
      traits: {
        effortLevel: picks.reasoningLevel ?? repo.defaultReasoningLevel,
        thinkingEnabled: picks.thinkingEnabled ?? repo.defaultThinkingEnabled,
        use1mContext: picks.use1mContext ?? repo.defaultUse1mContext,
        fastMode: picks.fastMode ?? repo.defaultFastMode,
      },
    }),
  );
}
