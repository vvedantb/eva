"use node";

import { v } from "convex/values";
import { z } from "zod";
import type { getInstallationOctokit } from "../githubAuth";
import type { PullRequestTarget } from "./pullRequestDraftState";

type InstallationOctokit = Awaited<ReturnType<typeof getInstallationOctokit>>;

/**
 * GitHub's native stacked pull requests (a preview feature). A stack is an
 * ordered chain of PRs from the ultimate base branch upwards; merging entry N
 * lands entries 1..N together, which is why the merge box has to know about
 * every PR below the one on screen.
 */

/** A stack longer than this is not something a reader navigates in a popover. */
const MAX_STACK_ENTRIES = 50;
/** One poll a second for up to five minutes, the same ceiling GitHub's own UI uses. */
const ASYNC_MERGE_POLL_LIMIT = 300;
const ASYNC_MERGE_POLL_INTERVAL_MS = 1_000;

const pullRequestStackEntryValidator = v.object({
  position: v.number(),
  number: v.number(),
  title: v.string(),
  htmlUrl: v.string(),
  headRef: v.string(),
  baseRef: v.string(),
  status: v.union(v.literal("open"), v.literal("closed"), v.literal("merged")),
  draft: v.boolean(),
  /** null while GitHub computes mergeability. */
  mergeable: v.union(v.boolean(), v.null()),
  /** REST's lowercase vocabulary: clean | dirty | blocked | behind | unstable | draft | unknown */
  mergeableState: v.string(),
});

export const pullRequestStackValidator = v.object({
  /** The stack's own number on GitHub, not a pull request number. */
  number: v.number(),
  size: v.number(),
  /** One-based position of the pull request this overview describes. */
  position: v.number(),
  baseRef: v.string(),
  /** Ordered from the base branch upwards, so `entries[0]` merges first. */
  entries: v.array(pullRequestStackEntryValidator),
});

export type PullRequestStackEntry = {
  position: number;
  number: number;
  title: string;
  htmlUrl: string;
  headRef: string;
  baseRef: string;
  status: "open" | "closed" | "merged";
  draft: boolean;
  mergeable: boolean | null;
  mergeableState: string;
};

export type PullRequestStack = {
  number: number;
  size: number;
  position: number;
  baseRef: string;
  entries: PullRequestStackEntry[];
};

const STACK_QUERY = `query($owner: String!, $repo: String!, $number: Int!, $first: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      stackEntry { position }
      stack {
        number
        size
        baseRefName
        entries(first: $first) {
          totalCount
          nodes {
            position
            pullRequest {
              number
              title
              url
              headRefName
              baseRefName
              state
              isDraft
              mergeable
              mergeStateStatus
            }
          }
        }
      }
    }
  }
}`;

const stackResponseSchema = z.object({
  repository: z.object({
    pullRequest: z
      .object({
        stackEntry: z.object({ position: z.number() }).nullish(),
        stack: z
          .object({
            number: z.number(),
            size: z.number(),
            baseRefName: z.string(),
            entries: z.object({
              totalCount: z.number(),
              nodes: z.array(
                z
                  .object({
                    position: z.number(),
                    pullRequest: z.object({
                      number: z.number(),
                      title: z.string(),
                      url: z.string(),
                      headRefName: z.string(),
                      baseRefName: z.string(),
                      state: z.enum(["OPEN", "CLOSED", "MERGED"]),
                      isDraft: z.boolean(),
                      mergeable: z.enum(["MERGEABLE", "CONFLICTING", "UNKNOWN"]),
                      mergeStateStatus: z.string().nullish(),
                    }),
                  })
                  .nullable(),
              ),
            }),
          })
          .nullish(),
      })
      .nullable(),
  }),
});

const MERGEABLE: Record<"MERGEABLE" | "CONFLICTING" | "UNKNOWN", boolean | null> = {
  MERGEABLE: true,
  CONFLICTING: false,
  UNKNOWN: null,
};

const STATUS: Record<"OPEN" | "CLOSED" | "MERGED", PullRequestStackEntry["status"]> = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
};

/**
 * The stack a pull request belongs to, or null when it is not stacked — and
 * also null when the repository has no access to the preview, so a GraphQL
 * schema error must never take the rest of the overview down with it.
 *
 * A partial answer (a page short, positions with gaps) is treated as no stack
 * rather than a guessed one: the merge box would otherwise count the wrong PRs.
 */
export async function fetchPullRequestStack(
  octokit: InstallationOctokit,
  target: PullRequestTarget,
): Promise<PullRequestStack | null> {
  const raw = await octokit
    .graphql(STACK_QUERY, {
      owner: target.owner,
      repo: target.repo,
      number: target.pull_number,
      first: MAX_STACK_ENTRIES,
    })
    .catch(() => null);
  const parsed = stackResponseSchema.safeParse(raw);
  if (!parsed.success) return null;

  const pullRequest = parsed.data.repository.pullRequest;
  const stack = pullRequest?.stack;
  const selected = pullRequest?.stackEntry;
  if (!stack || !selected) return null;

  const entries = stack.entries.nodes
    .flatMap((node): PullRequestStackEntry[] =>
      node
        ? [
            {
              position: node.position,
              number: node.pullRequest.number,
              title: node.pullRequest.title,
              htmlUrl: node.pullRequest.url,
              headRef: node.pullRequest.headRefName,
              baseRef: node.pullRequest.baseRefName,
              status: STATUS[node.pullRequest.state],
              draft: node.pullRequest.isDraft,
              mergeable: MERGEABLE[node.pullRequest.mergeable],
              mergeableState: (
                node.pullRequest.mergeStateStatus ?? "unknown"
              ).toLowerCase(),
            },
          ]
        : [],
    )
    .toSorted((a, b) => a.position - b.position);

  const consistent =
    stack.size === stack.entries.totalCount &&
    entries.length === stack.size &&
    entries.every((entry, index) => entry.position === index + 1) &&
    entries[selected.position - 1]?.number === target.pull_number;
  if (!consistent) return null;

  return {
    number: stack.number,
    size: stack.size,
    position: selected.position,
    baseRef: stack.baseRefName,
    entries,
  };
}

const asyncMergeResultSchema = z.object({
  status: z.enum(["pending", "merged", "enqueued", "failed"]),
  details: z
    .object({
      message: z.string().nullish(),
      uuid: z.string().nullish(),
    })
    .nullish(),
});

/** A 409 (already in flight) and a 400 (terminal failure) both carry a usable body. */
const asyncMergeErrorSchema = z.object({
  status: z.number(),
  response: z.object({ data: asyncMergeResultSchema }).optional(),
});

export type StackMergeOutcome = "merged" | "enqueued";

/**
 * Merges a stacked pull request and every open entry below it in one step,
 * through GitHub's asynchronous merge endpoint. The plain merge API would land
 * only this PR, into the branch of the one below it, which is not what a reader
 * pressing "Merge 3 PRs" asked for.
 *
 * Returns null when the endpoint does not exist for this repository (404), so
 * the caller can fall back to the ordinary merge.
 */
export async function mergeStackAsync(
  octokit: InstallationOctokit,
  target: PullRequestTarget,
  method: "merge" | "squash" | "rebase",
): Promise<StackMergeOutcome | null> {
  const route = `/repos/${target.owner}/${target.repo}/pulls/${target.pull_number}/merge-async`;
  let result: z.infer<typeof asyncMergeResultSchema>;
  try {
    const res = await octokit.request(`PUT ${route}`, {
      merge_method: method,
      merge_action: "default",
    });
    result = asyncMergeResultSchema.parse(res.data);
  } catch (error) {
    const parsed = asyncMergeErrorSchema.safeParse(error);
    if (!parsed.success) throw error;
    if (parsed.data.status === 404) return null;
    if (!parsed.data.response) throw error;
    result = parsed.data.response.data;
  }

  for (let poll = 0; poll <= ASYNC_MERGE_POLL_LIMIT; poll += 1) {
    if (result.status === "merged" || result.status === "enqueued") {
      return result.status;
    }
    if (result.status === "failed") {
      throw new Error(
        result.details?.message?.trim() || "GitHub could not merge the stack.",
      );
    }
    const uuid = result.details?.uuid?.trim();
    if (!uuid) {
      throw new Error("GitHub returned a pending merge without an identifier.");
    }
    await new Promise((resolve) =>
      setTimeout(resolve, ASYNC_MERGE_POLL_INTERVAL_MS),
    );
    const res = await octokit.request(`GET ${route}/${uuid}`);
    result = asyncMergeResultSchema.parse(res.data);
  }
  throw new Error("GitHub's stack merge did not finish within five minutes.");
}
