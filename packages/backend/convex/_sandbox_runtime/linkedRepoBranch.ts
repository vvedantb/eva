/**
 * Pure shell-command builders for checking out a linked repo's session branch,
 * kept out of `linkedRepos.ts` (which is `"use node"`) so they can be unit
 * tested without a sandbox handle or the node-only import chain — matches
 * `divergedPublish.ts`.
 */

import { quote } from "shell-quote";

/**
 * Checks out the session branch right after a fresh clone. Starts from the
 * remote session branch when a prior sandbox already pushed it — a resumed
 * session whose sandbox was recreated keeps its commits — otherwise starts
 * fresh from the base branch.
 */
export function freshCloneCheckoutCommand(
  path: string,
  branchName: string,
  baseBranch: string,
  branchExistsRemotely: boolean,
): string {
  const startPoint = branchExistsRemotely
    ? `origin/${branchName}`
    : `origin/${baseBranch}`;
  return `cd ${quote([path])} && git checkout -B ${quote([branchName])} ${quote([startPoint])}`;
}

/**
 * Ensures the session branch is checked out in an already-cloned linked repo
 * (the sandbox was resumed and this repo was cloned in a previous run).
 */
export function resumeCheckoutCommand(
  path: string,
  branchName: string,
  baseBranch: string,
  branchExistsLocally: boolean,
): string {
  return branchExistsLocally
    ? `cd ${quote([path])} && git checkout ${quote([branchName])}`
    : `cd ${quote([path])} && git checkout -B ${quote([branchName])} ${quote([`origin/${baseBranch}`])}`;
}

/** `git ls-remote` check for whether a branch exists on origin, inside an already-cloned repo dir. */
export function branchExistsRemoteCommand(
  path: string,
  branchName: string,
): string {
  return `cd ${quote([path])} && git ls-remote --heads origin ${quote([branchName])}`;
}
