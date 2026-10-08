import { WORKSPACE_ROOT } from "./workspaceLayout";

/**
 * One linked repo, as the launched sandbox needs to know it. Mirrors
 * `LinkedRepo` in `callback-src/linkedRepos.ts` — that module parses exactly
 * this shape back out of `EVA_LINKED_REPOS`. Deliberately narrow: no `prUrl`,
 * no ids, nothing the agent doesn't need to orient itself in the checkout.
 */
export type LinkedRepoEnvRow = {
  owner: string;
  name: string;
  path: string;
  branchName: string;
  baseBranch: string;
};

/**
 * Builds the launch env vars describing a multi-repo session's linked repos.
 * Pure and dependency-free (isolate-safe) so both the node launch path and
 * tests can call it without a Convex context.
 *
 * Returns `{}` for an ordinary single-repo session (empty `rows`) — the
 * callback's `WORKSPACE_ROOT`/`LINKED_REPOS` both default to "no linked
 * repos" when these keys are absent, so there is nothing to gain from sending
 * an empty `EVA_LINKED_REPOS=[]` on every launch.
 */
export function buildLinkedReposEnv(
  rows: LinkedRepoEnvRow[],
): Record<string, string> {
  if (rows.length === 0) return {};
  return {
    EVA_WORKSPACE_ROOT: WORKSPACE_ROOT,
    EVA_LINKED_REPOS: JSON.stringify(
      rows.map((row) => ({
        owner: row.owner,
        name: row.name,
        path: row.path,
        branchName: row.branchName,
        baseBranch: row.baseBranch,
      })),
    ),
  };
}
