import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";
import { aiModelValidator } from "./validators";
import { buildPrBody } from "./prBody";
import {
  buildAutomationPrompt,
  buildReadOnlyPrompt,
  buildActionableReportPrompt,
} from "./_automationWorkflow/prompts";
import { parseFindingsFromResult } from "./_automationWorkflow/findings";
import { extractReadOnlyDeliverable } from "./_automationWorkflow/deliverable";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { automationRunStreamingEntityId } from "./_chat/agentStreamIds";
import { runOneShotAgent } from "./_agentJobs/runOneShotAgent";

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
    providerAccountId: v.optional(v.id("userProviderAccounts")),
    rootDirectory: v.string(),
    userId: v.id("users"),
    readOnly: v.optional(v.boolean()),
    actionsEnabled: v.optional(v.boolean()),
    // PR open and push runs: the PR's branch. The run works on it and pushes
    // edits there instead of opening a PR of its own.
    prBranch: v.optional(v.string()),
  },
  handler: async (step, args): Promise<void> => {
    const isReadOnly = args.readOnly === true;
    const workBranch = args.prBranch ?? args.branchName;
    const isActionable = isReadOnly && args.actionsEnabled === true;
    const saveError = async (error: string) => {
      await step.runMutation(internal.automations.updateRunStatus, {
        runId: args.runId,
        status: "error",
        error,
      });
    };

    await step.runMutation(internal.automations.updateRunStatus, {
      runId: args.runId,
      status: "running",
    });

    const data = await step.runQuery(internal.automations.getAutomationData, {
      automationId: args.automationId,
      repoId: args.repoId,
    });
    if (!data) {
      await saveError("Automation data not found");
    } else {
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
              workBranch,
              args.rootDirectory,
            );

      // Shared automations live on the monorepo root; Vercel credentials live
      // on app rows, so the sandbox runs on `sandboxRepoId`.
      await runOneShotAgent(step, {
        ownerId: args.runId,
        userId: args.userId,
        installationId: args.installationId,
        repo: {
          id: data.sandboxRepoId,
          owner: data.repoOwner,
          name: data.repoName,
        },
        sandbox: {
          kind: "ephemeral",
          baseBranch: data.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
          branchName:
            args.prBranch ?? (isReadOnly ? undefined : args.branchName),
          createRetry: { maxAttempts: 1, initialBackoffMs: 2000, base: 2 },
          // Ephemeral agent runs only need checkout + Claude; skip repo setup daemons.
          skipStartupCommands: true,
        },
        streamingEntityId: automationRunStreamingEntityId(args.runId),
        agent: {
          model: args.model,
          allowedTools: isReadOnly
            ? "Read,Bash,Glob,Grep"
            : "Read,Write,Edit,Bash,Glob,Grep",
          runId: String(args.runId),
          requireTaskCommit: !isReadOnly,
          providerAccountId: args.providerAccountId,
        },
        prompt,
        onSandboxReady: async (sandboxId) => {
          // Recorded so a cancel before launch can still delete it.
          await step.runMutation(internal.automations.updateRunStatus, {
            runId: args.runId,
            status: "running",
            sandboxId,
          });
        },
        onResult: async (result, sandboxId) => {
          let prUrl: string | null = null;
          if (result.success && !isReadOnly) {
            const pushResult = await step.runAction(
              internal.sandbox.pushSandboxBranch,
              {
                sandboxId,
                installationId: args.installationId,
                repoOwner: data.repoOwner,
                repoName: data.repoName,
                repoId: data.sandboxRepoId,
                branchName: workBranch,
              },
            );

            if (pushResult.pushed && args.prBranch !== undefined) {
              // Recorded so this push's own webhook does not start a run.
              // Best-effort: the edits are already on the PR either way.
              try {
                const pushedSha = await step.runAction(
                  internal.sandbox.readSandboxHead,
                  { sandboxId, repoId: data.sandboxRepoId },
                );
                await step.runMutation(
                  internal._automations.triggers.recordPushedSha,
                  { runId: args.runId, pushedSha },
                );
              } catch (error) {
                console.error(
                  `[automations] could not record pushed head runId=${args.runId}`,
                  error,
                );
              }
            }
            // No commits pushed (ahead-of-remote gate) → no diff, no PR to
            // open. A PR branch run's edits are already on its PR.
            if (pushResult.pushed && args.prBranch === undefined) {
              prUrl = await step.runAction(
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
            error: result.success
              ? undefined
              : (result.error ?? "Unknown error"),
            resultSummary,
            prUrl: prUrl ?? undefined,
            activityLog: result.activityLog ?? undefined,
            findings: findings ?? undefined,
          });
        },
        onError: saveError,
      });
    }

    await step.runMutation(internal.automations.clearRunWorkflow, {
      runId: args.runId,
    });
  },
});
