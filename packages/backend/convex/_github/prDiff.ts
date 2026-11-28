"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { z } from "zod";
import { action, internalAction } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { getRepoOctokit, type getInstallationOctokit } from "../githubAuth";
import { extractPrNumber } from "./helpers";
import { readFileAtRef } from "./contents";
import { isPrDiffTooLargeError, listFileToUnifiedDiff } from "./prDiffFallback";
import { getActionRepoWithAccess } from "../functions";

/**
 * Cap on a unified diff we hold in one payload: the diff returned to the
 * client and the diff fed to the PR recap model.
 */
export const MAX_DIFF_BYTES = 500_000;

const MAX_FILE_BYTES = 400_000;

const PR_DIFF_CACHE_TTL_MS = 120_000;

const PR_FILE_CACHE_TTL_MS = 30 * 60_000;

const prDiffResultValidator = v.object({
  diff: v.string(),
  truncated: v.boolean(),
  headSha: v.string(),
  baseSha: v.string(),
  /** `https://github.com/<owner>/<name>`, for per-file "View file" links. */
  repoUrl: v.string(),
  workBranch: v.union(v.string(), v.null()),
});

type PrDiffResult = {
  diff: string;
  truncated: boolean;
  headSha: string;
  baseSha: string;
  repoUrl: string;
  workBranch: string | null;
};

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

async function fetchPrDiffViaListFiles(
  octokit: InstallationOctokit,
  owner: string,
  name: string,
  prNumber: number,
): Promise<string> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo: name,
    pull_number: prNumber,
    per_page: 100,
  });
  return files.map(listFileToUnifiedDiff).join("\n");
}

/**
 * Uncached GitHub PR diff fetch — wrapped by ActionCache. Auth is enforced by
 * the public `getPrDiff` wrapper before `fetch`.
 */
export const fetchPrDiff = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.number(),
  },
  returns: prDiffResultValidator,
  handler: async (ctx, args): Promise<PrDiffResult> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    const metaPromise = octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: args.prNumber,
    });

    let fullDiff: string;
    try {
      const res = await octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: args.prNumber,
        mediaType: { format: "diff" },
      });
      fullDiff = z.string().parse(res.data);
    } catch (error) {
      if (!(error instanceof Error) || !isPrDiffTooLargeError(error)) {
        throw error;
      }
      fullDiff = await fetchPrDiffViaListFiles(
        octokit,
        repo.owner,
        repo.name,
        args.prNumber,
      );
    }

    const meta = await metaPromise;

    const truncated = fullDiff.length > MAX_DIFF_BYTES;
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return {
      diff,
      truncated,
      headSha: meta.data.head.sha,
      baseSha: meta.data.base.sha,
      repoUrl: `https://github.com/${repo.owner}/${repo.name}`,
      workBranch:
        meta.data.state === "open" &&
        meta.data.head.repo?.full_name === meta.data.base.repo.full_name
          ? meta.data.head.ref
          : null,
    };
  },
});

const prDiffCache = new ActionCache(components.actionCache, {
  action: internal._github.prDiff.fetchPrDiff,
  name: "prDiffV3",
  ttl: PR_DIFF_CACHE_TTL_MS,
});

/**
 * Public action powering the sandbox "Diffs" tab. Fetches the canonical PR diff
 * from GitHub (the raw unified-diff media type) so the client can render it with
 * `@pierre/diffs`. When that media type is refused past GitHub's 300-file
 * ceiling, rebuilds the same shape from paginated `pulls.listFiles` patches.
 * Reflects what has been pushed to the PR, not uncommitted working-tree
 * changes. ActionCache-backed (120s TTL); pass `force` to bypass (Refresh).
 */
export const getPrDiff = action({
  args: {
    repoId: v.id("githubRepos"),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  returns: prDiffResultValidator,
  handler: async (ctx, args): Promise<PrDiffResult> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    const prNumber =
      args.prNumber !== undefined
        ? args.prNumber
        : args.prUrl !== undefined
          ? extractPrNumber(args.prUrl)
          : null;
    if (prNumber === null) {
      throw new Error(
        args.prUrl !== undefined
          ? `Could not parse a PR number from URL: ${args.prUrl}`
          : "prNumber or prUrl is required",
      );
    }

    return await prDiffCache.fetch(
      ctx,
      { repoId: args.repoId, prNumber },
      { force: args.force === true },
    );
  },
});

const COMMIT_DIFF_CACHE_TTL_MS = 30 * 60_000;

const commitDiffResultValidator = v.object({
  diff: v.string(),
  truncated: v.boolean(),
  message: v.string(),
  additions: v.number(),
  deletions: v.number(),
  changedFiles: v.number(),
});

type CommitDiffResult = {
  diff: string;
  truncated: boolean;
  message: string;
  additions: number;
  deletions: number;
  changedFiles: number;
};

/**
 * Uncached single-commit diff fetch — wrapped by ActionCache. Auth is enforced by
 * the public `getCommitDiff` wrapper before `fetch`.
 */
export const fetchCommitDiff = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    sha: v.string(),
  },
  returns: commitDiffResultValidator,
  handler: async (ctx, args): Promise<CommitDiffResult> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    const [res, meta] = await Promise.all([
      octokit.rest.repos.getCommit({
        owner: repo.owner,
        repo: repo.name,
        ref: args.sha,
        mediaType: { format: "diff" },
      }),
      octokit.rest.repos.getCommit({
        owner: repo.owner,
        repo: repo.name,
        ref: args.sha,
      }),
    ]);
    const fullDiff = z.string().parse(res.data);

    const truncated = fullDiff.length > MAX_DIFF_BYTES;
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return {
      diff,
      truncated,
      message: meta.data.commit.message,
      additions: meta.data.stats?.additions ?? 0,
      deletions: meta.data.stats?.deletions ?? 0,
      changedFiles: meta.data.files?.length ?? 0,
    };
  },
});

const commitDiffCache = new ActionCache(components.actionCache, {
  action: internal._github.prDiff.fetchCommitDiff,
  name: "commitDiffV1",
  ttl: COMMIT_DIFF_CACHE_TTL_MS,
});

/**
 * The diff of one commit, for the dialog behind a commit row in the pull request
 * timeline. Separate from `getPrDiff`: that answers "what does this branch change
 * overall", this answers "what did this commit do".
 */
export const getCommitDiff = action({
  args: {
    repoId: v.id("githubRepos"),
    sha: v.string(),
  },
  returns: commitDiffResultValidator,
  handler: async (ctx, args): Promise<CommitDiffResult> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    return await commitDiffCache.fetch(ctx, {
      repoId: args.repoId,
      sha: args.sha,
    });
  },
});

const compareDiffResultValidator = v.object({
  diff: v.string(),
  truncated: v.boolean(),
  unavailable: v.boolean(),
});

type CompareDiffResult = {
  diff: string;
  truncated: boolean;
  unavailable: boolean;
};

const requestErrorSchema = z.object({ status: z.number() });

/**
 * Uncached base...head compare fetch — wrapped by ActionCache. Auth is enforced
 * by the public `getCompareDiff` wrapper before `fetch`.
 */
export const fetchCompareDiff = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    baseSha: v.string(),
    headSha: v.string(),
  },
  returns: compareDiffResultValidator,
  handler: async (ctx, args): Promise<CompareDiffResult> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    let data: unknown;
    try {
      const res = await octokit.rest.repos.compareCommitsWithBasehead({
        owner: repo.owner,
        repo: repo.name,
        basehead: `${args.baseSha}...${args.headSha}`,
        mediaType: { format: "diff" },
      });
      data = res.data;
    } catch (error) {
      const parsed = requestErrorSchema.safeParse(error);
      if (parsed.success && parsed.data.status === 404) {
        return { diff: "", truncated: false, unavailable: true };
      }
      throw error;
    }
    const fullDiff = z.string().parse(data);

    const truncated = fullDiff.length > MAX_DIFF_BYTES;
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return { diff, truncated, unavailable: false };
  },
});

const compareDiffCache = new ActionCache(components.actionCache, {
  action: internal._github.prDiff.fetchCompareDiff,
  name: "compareDiffV1",
  ttl: COMMIT_DIFF_CACHE_TTL_MS,
});

/**
 * The combined diff between two commits on the same branch: what one session
 * turn changed (`beforeSha...afterSha` on the assistant message).
 */
export const getCompareDiff = action({
  args: {
    repoId: v.id("githubRepos"),
    baseSha: v.string(),
    headSha: v.string(),
    force: v.optional(v.boolean()),
  },
  returns: compareDiffResultValidator,
  handler: async (ctx, args): Promise<CompareDiffResult> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    return await compareDiffCache.fetch(
      ctx,
      { repoId: args.repoId, baseSha: args.baseSha, headSha: args.headSha },
      { force: args.force === true },
    );
  },
});

const prFileContentsValidator = v.object({
  oldContents: v.union(v.string(), v.null()),
  newContents: v.union(v.string(), v.null()),
  skipped: v.union(v.null(), v.literal("too-large"), v.literal("binary")),
});

type PrFileContents = {
  oldContents: string | null;
  newContents: string | null;
  skipped: null | "too-large" | "binary";
};

/**
 * Uncached full-file fetch for both sides of a changed file — wrapped by
 * ActionCache. Auth is enforced by the public wrapper before `fetch`.
 */
export const fetchPrFileContents = internalAction({
  args: {
    repoId: v.id("githubRepos"),
    path: v.string(),
    baseSha: v.string(),
    headSha: v.string(),
  },
  returns: prFileContentsValidator,
  handler: async (ctx, args): Promise<PrFileContents> => {
    const { repo, octokit } = await getRepoOctokit(ctx, args.repoId);
    const [old, next] = await Promise.all([
      readFileAtRef(octokit, {
        owner: repo.owner,
        name: repo.name,
        path: args.path,
        ref: args.baseSha,
        maxBytes: MAX_FILE_BYTES,
      }),
      readFileAtRef(octokit, {
        owner: repo.owner,
        name: repo.name,
        path: args.path,
        ref: args.headSha,
        maxBytes: MAX_FILE_BYTES,
      }),
    ]);

    return {
      oldContents: old.contents,
      newContents: next.contents,
      skipped: old.skipped ?? next.skipped,
    };
  },
});

const prFileContentsCache = new ActionCache(components.actionCache, {
  action: internal._github.prDiff.fetchPrFileContents,
  name: "prFileContentsV1",
  ttl: PR_FILE_CACHE_TTL_MS,
});

/**
 * Full contents of one changed file at both ends of a PR. The Diffs tab uses
 * this to switch a file from its (context-limited) patch to a diff generated
 * from whole files, which is what makes GitHub-style "expand unchanged lines"
 * possible. Loaded per file, on demand — never for the whole PR at once.
 */
export const getPrFileContents = action({
  args: {
    repoId: v.id("githubRepos"),
    path: v.string(),
    baseSha: v.string(),
    headSha: v.string(),
  },
  returns: prFileContentsValidator,
  handler: async (ctx, args): Promise<PrFileContents> => {
    await getActionRepoWithAccess(ctx, args.repoId);

    return await prFileContentsCache.fetch(ctx, {
      repoId: args.repoId,
      path: args.path,
      baseSha: args.baseSha,
      headSha: args.headSha,
    });
  },
});
