import { useState } from "react";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { useRepo } from "@/lib/contexts/RepoContext";

/**
 * Base-branch picker state for the surfaces that create work against a repo
 * (new-session composer, quick-task modal, new-project modal).
 *
 * Switching apps — sidebar `+`, composer app switcher, rail tile — only changes
 * the route's params. The route component does not remount, so a plain
 * `useState` initializer keeps whichever branch it was seeded with at mount,
 * and a one-off pick silently applies to everything created afterwards. That is
 * how PR #615 came to target `staging` on a repo whose default is `main`.
 *
 * Re-seed on `repo._id` rather than `owner/name`: the app row is what the
 * switcher changes, and each row carries its own `defaultBaseBranch`. The
 * tradeoff is that a deliberate pick no longer survives moving between sibling
 * apps of one monorepo — the wrong-branch merges cost more than that
 * convenience. Adjusting state during render is React's documented pattern for
 * derived-state resets, and matches `useTaskDetail`.
 */
export function useBaseBranchState(initialBranch?: string) {
  const { repo } = useRepo();
  const repoDefaultBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const [baseBranch, setBaseBranch] = useState(
    initialBranch ?? repoDefaultBranch,
  );

  const [prevRepoId, setPrevRepoId] = useState(repo._id);
  if (repo._id !== prevRepoId) {
    setPrevRepoId(repo._id);
    setBaseBranch(repoDefaultBranch);
  }

  return { baseBranch, setBaseBranch, repoDefaultBranch };
}
