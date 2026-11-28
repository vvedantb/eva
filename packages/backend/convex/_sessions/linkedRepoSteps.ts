import type { WorkflowCtx } from "@convex-dev/workflow";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { errorMessage } from "@vvedantb/server";

type AlertTarget =
  | { chatId: Id<"sessionChats"> }
  | { sessionId: Id<"sessions"> };

type LinkedRepoStepArgs = {
  sessionId: Id<"sessions">;
  sandboxId: string;
  repoId: Id<"githubRepos">;
};

/**
 * Clones (or catches up) every linked repo, one action each. A repo that
 * fails posts an alert and the rest go on.
 */
export async function prepareLinkedRepoSteps(
  step: WorkflowCtx,
  args: LinkedRepoStepArgs,
): Promise<void> {
  const linkedRepos = await step.runQuery(
    internal.sessions.listLinkedReposInternal,
    { sessionId: args.sessionId },
  );
  for (const linkedRepo of linkedRepos) {
    try {
      await step.runAction(internal.sandbox.prepareLinkedRepo, {
        sessionId: args.sessionId,
        sessionRepoId: linkedRepo._id,
        sandboxId: args.sandboxId,
        repoId: args.repoId,
      });
    } catch (error) {
      await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
        sessionId: args.sessionId,
        content: `Failed to prepare linked repo ${linkedRepo.name}`,
        errorDetail: errorMessage(error),
      });
    }
  }
}

/**
 * Pushes every linked repo with new commits and opens its draft PR
 * (idempotent). One repo failing never stops its siblings.
 */
export async function publishLinkedRepoSteps(
  step: WorkflowCtx,
  args: LinkedRepoStepArgs & { alert: AlertTarget },
): Promise<void> {
  let linkedPushes: Array<{
    sessionRepoId: Id<"sessionRepos">;
    pushed: boolean;
    published: boolean;
  }> = [];
  try {
    linkedPushes = await step.runAction(
      internal.sandbox.pushLinkedRepoBranches,
      { sessionId: args.sessionId, sandboxId: args.sandboxId, repoId: args.repoId },
    );
  } catch (error) {
    const errorDetail = errorMessage(error);
    console.error(
      `[linkedRepoSteps] pushLinkedRepoBranches failed sessionId=${args.sessionId}: ${errorDetail}`,
    );
    await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
      ...args.alert,
      content: "Failed to publish linked repository branches",
      errorDetail,
    });
  }
  for (const linkedPush of linkedPushes) {
    if (!linkedPush.pushed && !linkedPush.published) continue;
    try {
      await step.runAction(internal.github.createDraftSessionRepoPr, {
        sessionRepoId: linkedPush.sessionRepoId,
      });
    } catch (error) {
      const errorDetail = errorMessage(error);
      console.error(
        `[linkedRepoSteps] createDraftSessionRepoPr failed sessionRepoId=${linkedPush.sessionRepoId}: ${errorDetail}`,
      );
      await step.runMutation(internal.sessionWorkflow.postSystemAlert, {
        ...args.alert,
        content: "Failed to create draft PR for a linked repository",
        errorDetail,
      });
    }
  }
}
