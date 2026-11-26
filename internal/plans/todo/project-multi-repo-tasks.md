# Project tasks across several repos

**Date:** 26 November 2026
**Status:** TODO (v3, first item). Open questions below.
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

## Open questions

1. Who decides a task needs several repos: Eva on her own when the change spans them (recommended), or only when a person asks?
2. Done rule: all PRs merged (recommended), or the home repo's PR merged?
3. Merge order: Eva writes it in the PR bodies only (recommended), or she also keeps the second PR a draft until the first merges?

## Checks

- Backend tests: a task created with a linked repo gets one `sessionRepos` row; combined PR state (open / merged / closed); the coordinator tool refuses a repo the person cannot access.
- tsc, lint, web and backend tests; phone screens for the PR list.
