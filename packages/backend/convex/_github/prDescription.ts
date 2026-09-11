"use node";

import { v } from "convex/values";
import { quote } from "shell-quote";
import { internalAction } from "../_generated/server";
import { getInstallationOctokit } from "../githubAuth";
import { extractPrNumber } from "./prUrl";
import { getPullRequest, patchPullRequest } from "./pullRequestWrite";
import { resolveEnvVars } from "../envVarResolver";
import { getAIProviderAvailability } from "../_validators/aiModels";
import { execHandle, getSandboxHandle } from "../_sandbox_runtime/helpers";
import { writeSandboxFile } from "../_sandbox_runtime/sandboxFiles";
import {
  CLAUDE_FALLBACK_BIN_PATH,
  ensureClaudeCliAvailable,
} from "../_sandbox_runtime/launch";
import { fetchPullRequestDiff } from "./prRecapService";
import {
  buildPrDescriptionPrompt,
  cleanPrDescription,
  insertPrDescription,
  stripPrDescription,
} from "./prDescriptionPrompt";

/** Claude CLI alias. Haiku (used for session summaries) misreads diffs when
 * asked to sketch their shape; the description is one short call per push. */
const PR_DESCRIPTION_MODEL = "sonnet";
const PROMPT_PATH = "/tmp/eva-pr-description-prompt.txt";
/** The diff is already in the prompt, so one model turn is the budget; the
 * exec ceiling is generous because a cold CLI start can take a while. */
const EXEC_TIMEOUT_SECONDS = 240;

/**
 * Writes the reviewer-facing description into a PR body from its diff, using
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
      const envVars = await resolveEnvVars(ctx, args.repoId);
      if (!getAIProviderAvailability(Object.keys(envVars)).claude) {
        console.log(
          `[pr-description] ${label} skipped: no CLAUDE_CODE_OAUTH_TOKEN in sandbox env`,
        );
        return null;
      }

      const octokit = await getInstallationOctokit(args.installationId);
      const target = {
        owner: args.repoOwner,
        repo: args.repoName,
        prNumber,
      };
      const { data: pr } = await octokit.rest.pulls.get({
        owner: target.owner,
        repo: target.repo,
        pull_number: target.prNumber,
      });
      const diff = await fetchPullRequestDiff(octokit, target);
      if (diff.additions + diff.deletions === 0) {
        console.log(`[pr-description] ${label} has no diff; skipping`);
        return null;
      }

      const prompt = buildPrDescriptionPrompt({
        prTitle: pr.title,
        context: stripPrDescription(pr.body ?? ""),
        diffText: diff.diffText,
        changedFiles: diff.changedFiles,
        additions: diff.additions,
        deletions: diff.deletions,
        truncated: diff.truncated,
      });

      const sandbox = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
      await Promise.all([
        ensureClaudeCliAvailable(sandbox),
        writeSandboxFile(sandbox, PROMPT_PATH, prompt),
      ]);
      // Prompt goes in on stdin: it carries the whole diff, which is far past
      // what belongs on a command line. No tools — the diff is the input.
      const text = await execHandle(
        sandbox,
        `bin="$(command -v claude || echo ${quote([CLAUDE_FALLBACK_BIN_PATH])})"; "$bin" -p --model ${quote([PR_DESCRIPTION_MODEL])} --output-format text --allowedTools "" --max-turns 1 < ${quote([PROMPT_PATH])}`,
        EXEC_TIMEOUT_SECONDS,
      );
      const description = cleanPrDescription(text);
      if (description.length === 0) {
        console.error(`[pr-description] ${label} model returned empty text`);
        return null;
      }

      // Re-read the body right before writing: a later push may have refreshed
      // the static sections while the model was working, and we must not
      // overwrite them with the copy we read at the start.
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
        `[pr-description] ${label} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});
