import { v } from "convex/values";
import { launchAgentStep } from "./_sandbox_runtime/agentLaunchStep";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { aiModelValidator } from "./validators";
import { taskCompleteEvent } from "./_taskWorkflow/events";
import { buildPrBody } from "./prBody";
import { prepareSandboxSteps } from "./_sandbox_runtime/prepareSandboxSteps";
import {
  buildAutomationPrompt,
  buildReadOnlyPrompt,
  buildActionableReportPrompt,
} from "./_automationWorkflow/prompts";
import { parseFindingsFromResult } from "./_automationWorkflow/findings";
import { extractReadOnlyDeliverable } from "./_automationWorkflow/deliverable";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { automationRunStreamingEntityId } from "./_chat/agentStreamIds";

/** Runs an automation: prepares sandbox, executes the prompt, optionally creates a PR, and cleans up. */
export const automationExecutionWorkflow = workflow.define({
  args: {
    runId: v.id("automationRuns"),
    automationId: v.id("automations"),
    repoId: v.id("githubRepos"),
    installationId: v.number(),
    branchName: v.string(),
    description: v.string(),
    title: v.string(),
    model: aiModelValidator,
    rootDirectory: v.string(),
    userId: v.id("users"),
    readOnly: v.optional(v.boolean()),
    actionsEnabled: v.optional(v.boolean()),
  },
  handler: async (step, args): Promise<void> => {
    let sandboxId: string | undefined;

    let completionPrUrl: string | null = null;
    // App-row credentials for Vercel; defaults to automation repo until resolved.
    let sandboxRepoId = args.repoId;
    const isReadOnly = args.readOnly === true;
    const isActionable = isReadOnly && args.actionsEnabled === true;

    try {
      await step.runMutation(internal.automations.updateRunStatus, {
        runId: args.runId,
        status: "running",
      });

      const data = await step.runQuery(internal.automations.getAutomationData, {
        automationId: args.automationId,
        repoId: args.repoId,
      });
      if (!data) throw new Error("Automation data not found");
      // Shared automations live on the monorepo root; Vercel credentials live on
      // app rows. Use sandboxRepoId for create/launch/delete/push only.
      sandboxRepoId = data.sandboxRepoId;

      const prompt = isActionable
        ? buildActionableReportPrompt(
            args.title,
            args.description,
            args.rootDirectory,
          )
        : isReadOnly
          ? buildReadOnlyPrompt(
              args.title,
              args.description,
              args.rootDirectory,
            )
          : buildAutomationPrompt(
              args.title,
              args.description,
              args.branchName,
              args.rootDirectory,
            );

      const streamingEntityId = automationRunStreamingEntityId(args.runId);

      ({ sandboxId } = await prepareSandboxSteps(step, {
        installationId: args.installationId,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        ephemeral: true,
        repoId: sandboxRepoId,
        streamingEntityId,
        baseBranch: data.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
        branchName: isReadOnly ? undefined : args.branchName,
        createRetry: { maxAttempts: 1, initialBackoffMs: 2000, base: 2 },
        // Ephemeral agent runs only need checkout + Claude; skip repo setup daemons.
        skipStartupCommands: true,
      }));

      await step.runMutation(internal.automations.updateRunStatus, {
        runId: args.runId,
        status: "running",
        sandboxId,
      });

      await launchAgentStep(
        step,
        {
          sandboxId,
          entityId: String(args.runId),
          prompt,
          userId: args.userId,
          completionMutation: "automations:handleCompletion",
          entityIdField: "automationRunId",
          model: args.model,
          allowedTools: isReadOnly
            ? "Read,Bash,Glob,Grep"
            : "Read,Write,Edit,Bash,Glob,Grep",
          repoId: sandboxRepoId,
          streamingEntityId,
          runId: String(args.runId),
          requireTaskCommit: !isReadOnly,
        },
        {
          entityId: args.runId,
        },
      );

      const result = await step.awaitEvent(taskCompleteEvent);

      if (result.success && !isReadOnly) {
        const pushResult = await step.runAction(
          internal.sandbox.pushSandboxBranch,
          {
            sandboxId,
            installationId: args.installationId,
            repoOwner: data.repoOwner,
            repoName: data.repoName,
            repoId: sandboxRepoId,
            branchName: args.branchName,
          },
        );

        // No commits pushed (ahead-of-remote gate) → no diff, no PR to open.
        if (pushResult.pushed) {
          completionPrUrl = await step.runAction(
            internal.taskWorkflowActions.createPullRequest,
            {
              installationId: args.installationId,
              repoOwner: data.repoOwner,
              repoName: data.repoName,
              branchName: args.branchName,
              baseBranch: data.defaultBaseBranch,
              title: args.title,
              body: buildPrBody([
                {
                  heading: "Automation",
                  content: args.description || "No description",
                },
                {
                  heading: "Summary",
                  content: result.result ?? "No summary provided",
                },
              ]),
              labels: [
                "eva",
                "automation",
                ...(args.rootDirectory
                  ? [args.rootDirectory.split("/").pop()].filter(
                      (l): l is string => l !== undefined && l !== "",
                    )
                  : []),
              ],
            },
          );
        }
      }

      const rawResult = result.result ?? "";
      const findings =
        isActionable && result.success
          ? parseFindingsFromResult(rawResult)
          : null;
      const resultSummary =
        result.success && rawResult
          ? isReadOnly && !isActionable
            ? extractReadOnlyDeliverable(rawResult)
            : rawResult
          : undefined;

      await step.runMutation(internal.automations.updateRunStatus, {
        runId: args.runId,
        status: result.success ? "success" : "error",
        error: result.success ? undefined : (result.error ?? "Unknown error"),
        resultSummary,
        prUrl: completionPrUrl ?? undefined,
        activityLog: result.activityLog ?? undefined,
        findings: findings ?? undefined,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Automation workflow failed";
      await step.runMutation(internal.automations.updateRunStatus, {
        runId: args.runId,
        status: "error",
        error: msg,
      });
    } finally {
      // The sandbox is ephemeral: nothing references it once the run status is
      // written, so it has to be deleted here or it idles until the provider
      // reaps it. In the finally rather than on each path so a future early
      // return cannot skip it. Best-effort — a failed delete must not fail the
      // workflow.
      if (sandboxId) {
        try {
          await step.runAction(internal.sandbox.deleteSandbox, {
            sandboxId,
            repoId: sandboxRepoId,
          });
        } catch (cleanupError) {
          console.error("Failed to cleanup sandbox:", cleanupError);
        }
      }
      await step.runMutation(internal.automations.clearRunWorkflow, {
        runId: args.runId,
      });
    }
  },
});
