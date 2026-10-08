"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { getInstallationOctokit } from "../githubAuth";
import { resolveEnvVars } from "../envVarResolver";
import {
  getAIProviderAvailability,
  getAIModelProvider,
} from "../_validators/aiModels";
import { aiModelValidator } from "../validators";
import { PR_RECAP_COMMENT_MARKER, buildPrRecapCommentBody } from "./prComments";
import { buildEvaReviewUrl } from "../_taskWorkflow/urls";

const MAX_DIFF_BYTES = 500_000;
const MAX_FILES = 100;

const prDiffResultValidator = v.object({
  diffText: v.string(),
  additions: v.number(),
  deletions: v.number(),
  changedFiles: v.number(),
  truncated: v.boolean(),
});

const prMetadataValidator = v.object({
  prUrl: v.string(),
  prNumber: v.number(),
  prTitle: v.string(),
  headSha: v.string(),
  draft: v.boolean(),
  authorLogin: v.optional(v.string()),
});

/** Fetches PR metadata for MCP-triggered recaps. */
export const fetchPrMetadata = internalAction({
  args: {
    installationId: v.number(),
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
  },
  returns: prMetadataValidator,
  handler: async (_ctx, args) => {
    const octokit = await getInstallationOctokit(args.installationId);
    const { data: pr } = await octokit.rest.pulls.get({
      owner: args.owner,
      repo: args.repo,
      pull_number: args.prNumber,
    });
    return {
      prUrl: pr.html_url,
      prNumber: pr.number,
      prTitle: pr.title,
      headSha: pr.head.sha,
      draft: pr.draft ?? false,
      authorLogin: pr.user?.login,
    };
  },
});

export type PrDiffResult = {
  diffText: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  truncated: boolean;
};

/** Fetches a bounded per-file PR diff. Shared by the recap workflow and the
 * generated PR description so both see the same view of the change. */
export async function fetchPullRequestDiff(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  params: { owner: string; repo: string; prNumber: number },
): Promise<PrDiffResult> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: params.owner,
    repo: params.repo,
    pull_number: params.prNumber,
    per_page: 100,
  });

  let additions = 0;
  let deletions = 0;
  const chunks: string[] = [];
  let totalBytes = 0;
  let truncated = files.length > MAX_FILES;

  const cappedFiles = files.slice(0, MAX_FILES);
  for (const file of cappedFiles) {
    additions += file.additions;
    deletions += file.deletions;

    const patch = file.patch ?? "";
    const header = `### ${file.filename} (+${file.additions}/-${file.deletions})\n`;
    const block = `${header}${patch}\n`;
    if (totalBytes + block.length > MAX_DIFF_BYTES) {
      truncated = true;
      const remaining = MAX_DIFF_BYTES - totalBytes;
      if (remaining > 0) {
        chunks.push(block.slice(0, remaining));
        totalBytes += remaining;
      }
      break;
    }
    chunks.push(block);
    totalBytes += block.length;
  }

  return {
    diffText: chunks.join("\n"),
    additions,
    deletions,
    changedFiles: files.length,
    truncated,
  };
}

/** Fetches a bounded PR diff for recap generation. */
export const fetchPrDiff = internalAction({
  args: {
    installationId: v.number(),
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
  },
  returns: prDiffResultValidator,
  handler: async (_ctx, args) => {
    const octokit = await getInstallationOctokit(args.installationId);
    return await fetchPullRequestDiff(octokit, args);
  },
});

/** Creates or updates the sticky Eva PR recap comment on a GitHub pull request. */
export const upsertPrRecapComment = internalAction({
  args: {
    installationId: v.number(),
    owner: v.string(),
    repo: v.string(),
    prNumber: v.number(),
    body: v.optional(v.string()),
    /** Legacy; Reviews links use prNumber. Kept optional for older callers. */
    docNumId: v.optional(v.number()),
    headSha: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("ready"), v.literal("error"), v.literal("skipped")),
    ),
    message: v.optional(v.string()),
    rootDirectory: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    let body = args.body;
    if (!body) {
      if (!args.headSha || args.status === undefined) {
        throw new Error(
          "upsertPrRecapComment requires body or doc recap fields",
        );
      }
      body = buildPrRecapCommentBody({
        evaDocUrl: buildEvaReviewUrl(
          args.owner,
          args.repo,
          args.prNumber,
          "recap",
          args.rootDirectory,
        ),
        prNumber: args.prNumber,
        headSha: args.headSha,
        status: args.status,
        message: args.message,
      });
    }

    const octokit = await getInstallationOctokit(args.installationId);
    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
      owner: args.owner,
      repo: args.repo,
      issue_number: args.prNumber,
      per_page: 100,
    });

    const existing = comments.find((comment) =>
      comment.body?.includes(PR_RECAP_COMMENT_MARKER),
    );

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner: args.owner,
        repo: args.repo,
        comment_id: existing.id,
        body,
      });
      return null;
    }

    await octokit.rest.issues.createComment({
      owner: args.owner,
      repo: args.repo,
      issue_number: args.prNumber,
      body,
    });
    return null;
  },
});

/** Verifies the selected model's provider has auth configured in team/repo env vars. */
export const checkProviderAuth = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    model: aiModelValidator,
  },
  returns: v.object({
    ok: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const envVars = await resolveEnvVars(ctx, args.repoId);
    const availability = getAIProviderAvailability(Object.keys(envVars));
    const provider = getAIModelProvider(args.model);

    if (provider === "claude" && !availability.claude) {
      return {
        ok: false,
        message:
          "Add CLAUDE_CODE_OAUTH_TOKEN to team environment variables to generate PR recaps",
      };
    }
    if (provider === "codex" && !availability.codex) {
      return {
        ok: false,
        message: "Codex auth is not configured for this codebase",
      };
    }
    if (provider === "opencode" && !availability.opencode) {
      return {
        ok: false,
        message: "Opencode auth is not configured for this codebase",
      };
    }
    if (provider === "cursor" && !availability.cursor) {
      return {
        ok: false,
        message: "CURSOR_API_KEY is not configured for this codebase",
      };
    }

    return { ok: true, message: "" };
  },
});
