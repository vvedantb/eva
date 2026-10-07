"use node";

import { ActionCache } from "@convex-dev/action-cache";
import { v } from "convex/values";
import { z } from "zod";
import { action, internalAction } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { getInstallationOctokit } from "../githubAuth";
import { extractPrNumber } from "./helpers";
import {
  decodeGitHubContent,
  decodeGitHubContentBytes,
  githubContentContainsNul,
} from "../_repoSkills/decodeGitHubContent";
import { isPrDiffTooLargeError, listFileToUnifiedDiff } from "./prDiffFallback";
import { getActionRepoWithAccess } from "../functions";

/** Cap the diff we return to the client so huge PRs don't blow the payload. */
const MAX_DIFF_BYTES = 500_000;

/** Cap a single file's contents fetched for GitHub-style context expansion. */
const MAX_FILE_BYTES = 400_000;

/** Pushed PR diffs change less often than checks/comments. */
const PR_DIFF_CACHE_TTL_MS = 120_000;

/** File contents are addressed by commit sha, so they never change. */
const PR_FILE_CACHE_TTL_MS = 30 * 60_000;

const prDiffResultValidator = v.object({
  diff: v.string(),
  /** True when the diff was clipped at MAX_DIFF_BYTES. */
  truncated: v.boolean(),
  /** Head/base commits behind the diff — used to fetch full file contents. */
  headSha: v.string(),
  baseSha: v.string(),
  /** `https://github.com/<owner>/<name>`, for per-file "View file" links. */
  repoUrl: v.string(),
});

type PrDiffResult = {
  diff: string;
  truncated: boolean;
  headSha: string;
  baseSha: string;
  repoUrl: string;
};

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

/**
 * Paginated fallback when the unified-diff media type is refused. GitHub's
 * files listing supports up to 3000 entries (vs 300 for the media type).
 */
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
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    // JSON PR metadata is fine for large PRs — start it alongside the diff
    // attempt so a fallback listFiles path still reuses one meta round-trip.
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
      // With the diff media type GitHub returns raw unified-diff text, but
      // octokit types `data` as the PR object — parse to a string at the boundary.
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
    // Clip on a line boundary so the final file stays parseable.
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return {
      diff,
      truncated,
      headSha: meta.data.head.sha,
      baseSha: meta.data.base.sha,
      repoUrl: `https://github.com/${repo.owner}/${repo.name}`,
    };
  },
});

// V2: the payload gained head/base shas and the repo URL — a bumped name drops
// V1 entries instead of serving objects that are missing the new fields.
const prDiffCache = new ActionCache(components.actionCache, {
  action: internal._github.prDiff.fetchPrDiff,
  name: "prDiffV2",
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
    /** Preferred when the caller already has a PR number (Reviews routes). */
    prNumber: v.optional(v.number()),
    /** Sandbox Review still passes the full PR URL. */
    prUrl: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  returns: prDiffResultValidator,
  handler: async (ctx, args): Promise<PrDiffResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
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

/** A commit is immutable, so its diff can be cached far longer than a PR's. */
const COMMIT_DIFF_CACHE_TTL_MS = 30 * 60_000;

const commitDiffResultValidator = v.object({
  diff: v.string(),
  /** True when the diff was clipped at MAX_DIFF_BYTES. */
  truncated: v.boolean(),
  /** The whole message, including any body the timeline row has to hide. */
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
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
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
    // Same boundary as the PR diff: with the diff media type GitHub returns raw
    // unified-diff text, but octokit types `data` as the commit object.
    const fullDiff = z.string().parse(res.data);

    const truncated = fullDiff.length > MAX_DIFF_BYTES;
    // Clip on a line boundary so the final file stays parseable.
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return {
      diff,
      truncated,
      message: meta.data.commit.message,
      additions: meta.data.stats?.additions ?? 0,
      deletions: meta.data.stats?.deletions ?? 0,
      // GitHub itself lists at most 300 files per commit, so a vast commit
      // reports the cap rather than its true file count.
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

    return await commitDiffCache.fetch(ctx, {
      repoId: args.repoId,
      sha: args.sha,
    });
  },
});

const compareDiffResultValidator = v.object({
  diff: v.string(),
  /** True when the diff was clipped at MAX_DIFF_BYTES. */
  truncated: v.boolean(),
  /** True when GitHub does not know one of the shas yet (push still pending). */
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
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
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
      // A sha GitHub has not received yet is not a failure to surface: the turn's
      // push is still pending (or failed — PublishRecoveryBanner covers that).
      if (parsed.success && parsed.data.status === 404) {
        return { diff: "", truncated: false, unavailable: true };
      }
      throw error;
    }
    // Same boundary as the PR diff: with the diff media type GitHub returns raw
    // unified-diff text, but octokit types `data` as the comparison object.
    const fullDiff = z.string().parse(data);

    const truncated = fullDiff.length > MAX_DIFF_BYTES;
    // Clip on a line boundary so the final file stays parseable.
    const diff = truncated
      ? fullDiff.slice(0, fullDiff.lastIndexOf("\n", MAX_DIFF_BYTES))
      : fullDiff;

    return { diff, truncated, unavailable: false };
  },
});

// A sha pair is immutable, so a successful compare can live as long as a commit
// diff. An `unavailable` result is cached too — the client refetches with
// `force` when the user retries after the push lands.
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

    return await compareDiffCache.fetch(
      ctx,
      { repoId: args.repoId, baseSha: args.baseSha, headSha: args.headSha },
      { force: args.force === true },
    );
  },
});

const prFileContentsValidator = v.object({
  /** File at the base commit; null when the file was added in this PR. */
  oldContents: v.union(v.string(), v.null()),
  /** File at the head commit; null when the file was deleted in this PR. */
  newContents: v.union(v.string(), v.null()),
  /** Why contents were withheld, when they were. */
  skipped: v.union(v.null(), v.literal("too-large"), v.literal("binary")),
});

type PrFileContents = {
  oldContents: string | null;
  newContents: string | null;
  skipped: null | "too-large" | "binary";
};

type BlobResult = {
  contents: string | null;
  skipped: null | "too-large" | "binary";
};

// GitHub's contents API returns a union (file / directory / symlink / submodule);
// only the file shape carries what we need, so parse at the boundary.
const fileContentsSchema = z.object({
  type: z.literal("file"),
  encoding: z.string(),
  content: z.string(),
  size: z.number(),
});

/**
 * Reads one file at one commit. A missing file is not an error: the same path is
 * absent at the base commit for added files and at the head commit for deleted
 * ones, so 404 maps to `null` contents.
 */
async function readFileAtRef(
  octokit: Awaited<ReturnType<typeof getInstallationOctokit>>,
  owner: string,
  name: string,
  path: string,
  ref: string,
): Promise<BlobResult> {
  let data: unknown;
  try {
    const res = await octokit.rest.repos.getContent({
      owner,
      repo: name,
      path,
      ref,
    });
    data = res.data;
  } catch (error) {
    const parsed = requestErrorSchema.safeParse(error);
    // 403 is how the contents API reports a blob over its own 1MB ceiling.
    if (parsed.success && parsed.data.status === 404) {
      return { contents: null, skipped: null };
    }
    if (parsed.success && parsed.data.status === 403) {
      return { contents: null, skipped: "too-large" };
    }
    throw error;
  }

  const file = fileContentsSchema.safeParse(data);
  if (!file.success) return { contents: null, skipped: null };
  if (file.data.size > MAX_FILE_BYTES) {
    return { contents: null, skipped: "too-large" };
  }

  const bytes = decodeGitHubContentBytes(file.data.content);
  // A NUL byte is the same heuristic git uses to call a file binary.
  if (githubContentContainsNul(bytes)) {
    return { contents: null, skipped: "binary" };
  }

  return { contents: decodeGitHubContent(file.data.content), skipped: null };
}

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
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repo not found");

    const octokit = await getInstallationOctokit(repo.installationId);
    const [old, next] = await Promise.all([
      readFileAtRef(octokit, repo.owner, repo.name, args.path, args.baseSha),
      readFileAtRef(octokit, repo.owner, repo.name, args.path, args.headSha),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    await getActionRepoWithAccess(ctx, args.repoId);

    return await prFileContentsCache.fetch(ctx, {
      repoId: args.repoId,
      path: args.path,
      baseSha: args.baseSha,
      headSha: args.headSha,
    });
  },
});
