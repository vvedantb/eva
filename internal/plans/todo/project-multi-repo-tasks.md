# Project tasks across several repos

**Date:** 26 November 2026
**Status:** TODO (v3, first item). Decisions settled 26 November 2026.
**Example:** one change that needs `evalucom/carepulse_v2` (API) and `evalucom/carepulse-ts` (client).

## Today

- A project task works in one repo. A change that spans two repos becomes two tasks, which Eva orders (the second waits for the first to merge). Neither agent sees the other repo's change while it works.
- Sessions already support several repos (`docs/multi-repo-sessions.md`): `sessionRepos` rows are linked repos cloned into the same sandbox (`/tmp/workspace/<name>`), on the session's branch name, each with its own draft PR that cross-links its siblings. Push, PR creation, env files, dev servers and snapshots handle them.
- A task's work session is created by `insertWorkSession` (`_sessions/ownedSession.ts`) with no linked repos. A task's stage reads one `prState` (`@eva/shared/projectStatus`).

## Design

1. **Create.** The coordinator's `create_task` / `create_tasks_batch` take `linkedRepoNames` (repos besides the task's home repo; any repo the person can access). Stored on the task as `linkedRepoIds`. The coordinator rule: a change that must land in several repos together is one task with all of them; unrelated work stays one repo per task.
2. **Sandbox.** `insertWorkSession` inserts the task's `sessionRepos` rows from `linkedRepoIds` (the same rows a multi-repo session gets; factor the insert out of `_sessions/mutations.ts` into one helper both use). Everything after that (clone, branch, push, draft PRs with cross-links) is the session path, unchanged.
3. **Status.** The task's `prState` becomes the combined state of all its PRs (home and linked): `open` while any is open; `merged` once all are merged; `closed` when none is open and not all merged. Computed where a PR event already updates the task (`_pullRequests/store.ts`), so `projectStatus` rules stay as they are: review while any PR is open, done when all merged.
4. **UI (web and phone).** The task's Review tab and its Tasks row list one PR per repo, labelled with the repo (reuse the session's repo badges). The task header shows its repos.
5. **Merge order.** Eva states the order in every PR body ("merge carepulse_v2 #12 first"). See question 3.

## Out of scope

- The coordinator's own sandbox gets no linked repos (it can already read sibling repos under the same owner).
- Apps of the same repo (`carepulse-ts` `apps/web` and `apps/eprocurement`) are one git repo: a task in that repo already sees both.

## Decisions (user, 26 November 2026)

| # | Decision |
|---|---|
| 1 | Eva decides: a change that must land in several repos together is one task with all of them; unrelated work stays one repo per task. |
| 2 | Done when all the task's PRs are merged; in review while any is open. |
| 3 | Merge order is written in every PR body; no PR is held back as a draft. |

## Checks

- Backend tests: a task created with a linked repo gets one `sessionRepos` row; combined PR state (open / merged / closed); the coordinator tool refuses a repo the person cannot access.
- tsc, lint, web and backend tests; phone screens for the PR list.

## Changes while building (26 November 2026)

- Task runs (`taskExecutionWorkflow`) start the sandbox through `prepareSandboxSteps`, not the session startup workflow, so they cloned no linked repos and published none. They now clone linked repos after the sandbox attaches, get the linked-repo env (`launch` resolves the task's session) and prompt block, and push each linked repo and open its draft PR after the run. Task chat turns were gated to standalone sessions (`ownsPullRequests`); they now publish linked repos too. One helper does both for sessions and tasks (`_sessions/linkedRepoSteps.ts`).
- Linked PRs stay session-owned (`owner.sessionRepoId`). The task reads them through its session (`listTaskLinkedPullRequests`): its summary, the webhook's done rule, `pullRequests.listForOwner`, and cancel / un-cancel / ready / draft.
- The combined state keeps draft apart from open (draft while every live PR is a draft), so a single-repo task reads exactly as before and `projectStatus` is unchanged.
- Merge order: the coordinator writes it in the task description. Every PR body carries that description (the linked PR body now has the task's "Task" section and its Eva link). The task agent is not asked to edit PR bodies: its run prompt forbids `gh pr` commands, and the PRs open after the run.
- Owned sessions no longer go through the PR auto-archive rule (`reconcileSessionArchiveState`); the task's status retires its session.
- Phone has no session repo badges, so the phone task header gets none; the phone shows repos in the PR sheet and the Tasks list.
- The home PR opens before the linked PRs, so its body did not list them. Now `buildTaskPullRequestBody` adds a marked "Related pull requests" block from `taskRelatedPrLinks` (the linked rows of the combined state), and `createDraftSessionRepoPr` patches that block into the task PR after each linked PR opens (best-effort). The description rewrite leaves the block alone.
- Known gap: moving a multi-repo task to code review rewrites only the home PR's description, which may drop the merge order there.

