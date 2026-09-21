"use client";

import { IconGitBranch } from "@tabler/icons-react";
import { cn, toast, Tooltip, TooltipContent, TooltipTrigger } from "@eva/ui";

interface SandboxBranchChipProps {
  /** Branch the sandbox worktree is on, from the entity doc's `sandboxBranch`. */
  branch: string | undefined;
  isSandboxActive: boolean;
  /** Eva's stored branch for this chat, when it has one; a mismatch is hinted. */
  intendedBranch?: string;
}

/**
 * Read-only chip on the composer's under-input bar naming the branch the
 * sandbox worktree is actually checked out on right now. The daemon reports it
 * live, so this is the ground truth — not the branch Eva meant to boot on.
 */
export function SandboxBranchChip({
  branch,
  isSandboxActive,
  intendedBranch,
}: SandboxBranchChipProps) {
  // A stopped sandbox has no worktree, so the last reported branch is stale;
  // showing it would state a live fact that is no longer true.
  if (!isSandboxActive || !branch) return null;

  // Eva booted the sandbox on `intendedBranch`, but something inside it (a
  // checkout, a rebase, a stacked branch) moved the worktree. Worth surfacing,
  // not worth shouting about.
  const isMismatched = intendedBranch !== undefined && intendedBranch !== branch;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Sandbox is on branch ${branch}. Copy branch name.`}
          onClick={() => {
            void navigator.clipboard.writeText(branch).then(() => {
              toast.success("Branch name copied");
            });
          }}
          className={cn(
            "motion-press flex h-7 min-w-0 max-w-[min(220px,40vw)] items-center gap-1 rounded-md px-2 text-xs font-normal hover:bg-muted hover:text-foreground active:scale-[0.97]",
            isMismatched ? "text-warning" : "text-muted-foreground",
          )}
        >
          <IconGitBranch size={14} className="shrink-0" />
          <span className="truncate">{branch}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block">Sandbox is on {branch}</span>
        {isMismatched ? (
          <span className="block text-muted-foreground">
            Chat branch is {intendedBranch}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
