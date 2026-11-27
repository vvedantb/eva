"use node";

import { v } from "convex/values";
import { quote } from "shell-quote";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { getInstallationOctokit } from "../githubAuth";
import { extractPrNumber } from "./prUrl";
import { getPullRequest, patchPullRequest } from "./pullRequestWrite";
import { resolveEnvVars } from "../envVarResolver";
import { getAIProviderAvailability } from "../_validators/aiModels";
import {
  ensureSandboxRunning,
  execHandle,
  getSandboxHandle,
} from "../_sandbox_runtime/helpers";
import { writeSandboxFile } from "../_sandbox_runtime/sandboxFiles";
import { sandboxStillWanted } from "../_sandbox_runtime/execution";
import {
  CLAUDE_FALLBACK_BIN_PATH,
  ensureClaudeCliAvailable,
  resolveClaudeCliVersion,
} from "../_sandbox_runtime/launch";
import {
  listPullRequestFiles,
  summarizePullRequestDiff,
} from "./prRecapService";
import { assessMergeRisk, insertMergeRisk, stripMergeRisk } from "./mergeRisk";
import {
  buildPrDescriptionPrompt,
  cleanPrDescription,
  insertPrDescription,
  stripPrDescription,
} from "./prDescriptionPrompt";
import { errorMessage } from "@vvedantb/server";

const PR_DESCRIPTION_MODEL = "sonnet";
const PROMPT_PATH = "/tmp/eva-pr-description-prompt.txt";
const EXEC_TIMEOUT_SECONDS = 240;

/**
 * Writes the fixed merge-risk block into a PR body, then the reviewer-facing
 * description from its diff. The risk block needs no model, so it lands even
 * when the description is skipped. The description uses
 * the Claude CLI on the run's own sandbox so it bills to the team's Claude
 * auth and needs no second provider. Called by the task workflow right after
 * its PR create/refresh (while the sandbox is still up) and by a session's
 * "Send for review" (`createSessionPr`).
 * Best-effort: every failure is logged and the static body stays in place, so
 * a missing token, a stopped sandbox or a killed CLI never blocks a PR.
 */
export const generatePrDescription = internalAction({
  args: {
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    prUrl: v.string(),
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    restoreStoppedSandbox: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prNumber = extractPrNumber(args.prUrl);
    if (prNumber === null) {
      console.error(`[pr-description] unrecognised PR url ${args.prUrl}`);
      return null;
    }
    const label = `${args.repoOwner}/${args.repoName}#${prNumber}`;
    try {
      const octokit = await getInstallationOctokit(args.installationId);
      const target = {
        owner: args.repoOwner,
        repo: args.repoName,
        prNumber,
      };
      const pullRef = {
        owner: target.owner,
        repo: target.repo,
        pull_number: target.prNumber,
      };
      const [{ data: pr }, files, envVars] = await Promise.all([
        octokit.rest.pulls.get(pullRef),
        listPullRequestFiles(octokit, target),
        resolveEnvVars(ctx, args.repoId),
      ]);
      const diff = summarizePullRequestDiff(files);
      if (diff.additions + diff.deletions === 0) {
        console.log(`[pr-description] ${label} has no diff; skipping`);
        return null;
      }

      await patchPullRequest(octokit, pullRef, {
        body: insertMergeRisk(pr.body ?? "", assessMergeRisk(files)),
      });

      if (!getAIProviderAvailability(Object.keys(envVars)).claude) {
        console.log(
          `[pr-description] ${label} skipped: no CLAUDE_CODE_OAUTH_TOKEN in sandbox env`,
        );
        return null;
      }

      const prompt = buildPrDescriptionPrompt({
        prTitle: pr.title,
        context: stripMergeRisk(stripPrDescription(pr.body ?? "")),
        diffText: diff.diffText,
        changedFiles: diff.changedFiles,
        additions: diff.additions,
        deletions: diff.deletions,
        truncated: diff.truncated,
      });

      const restore =
        args.restoreStoppedSandbox === true ||
        !(await sandboxStillWanted(ctx, args.sandboxId, undefined));
      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      let text: string;
      try {
        if (restore) {
          await ensureSandboxRunning(sandbox, { resumeAfterStop: true });
        }
        await Promise.all([
          resolveClaudeCliVersion().then((version) =>
            ensureClaudeCliAvailable(sandbox, version),
          ),
          writeSandboxFile(sandbox, PROMPT_PATH, prompt),
        ]);
        text = await execHandle(
          sandbox,
          `bin="$(command -v claude || echo ${quote([CLAUDE_FALLBACK_BIN_PATH])})"; "$bin" -p --model ${quote([PR_DESCRIPTION_MODEL])} --output-format text --allowedTools "" --max-turns 1 < ${quote([PROMPT_PATH])}`,
          EXEC_TIMEOUT_SECONDS,
        );
      } finally {
        if (
          restore &&
          !(await sandboxStillWanted(ctx, args.sandboxId, undefined))
        ) {
          try {
            await ctx.runAction(internal.sandbox.stopSandbox, {
              sandboxId: args.sandboxId,
              repoId: args.repoId,
            });
          } catch (stopError) {
            console.error(
              `[pr-description] ${label} re-stop failed: ${errorMessage(stopError)}`,
            );
          }
        }
      }
      const description = cleanPrDescription(text);
      if (description.length === 0) {
        console.error(`[pr-description] ${label} model returned empty text`);
        return null;
      }

      const latest = await getPullRequest(octokit, {
        owner: target.owner,
        repo: target.repo,
        pull_number: target.prNumber,
      });
      await patchPullRequest(
        octokit,
        {
          owner: target.owner,
          repo: target.repo,
          pull_number: target.prNumber,
        },
        { body: insertPrDescription(latest.body ?? "", description) },
      );
    } catch (error) {
      console.error(
        `[pr-description] ${label} failed: ${errorMessage(error)}`,
      );
    }
    return null;
  },
});
