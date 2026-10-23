"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { IconGitBranch, IconUpload } from "@tabler/icons-react";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import {
  cn,
  Spinner,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { convexErrorMessage } from "@/lib/utils/convexErrorMessage";

type SandboxGitTarget = FunctionArgs<
  typeof api.sandbox.commitAndPushSandbox
>["target"];

interface SandboxBranchChipProps {
  /** Branch the sandbox worktree is on, from the entity doc's `sandboxBranch`. */
  branch: string | undefined;
  isSandboxActive: boolean;
  /** Eva's stored branch for this chat, when it has one; a mismatch is hinted. */
  intendedBranch?: string;
  /** Work on `branch` not on GitHub yet, from the entity doc's `sandboxGitSync`. */
  gitSync?: Doc<"sessions">["sandboxGitSync"];
  /** The sandbox owner "Commit & push" acts on. */
  target: SandboxGitTarget;
}

/**
 * Chip on the composer's under-input bar naming the branch the sandbox
 * worktree is actually checked out on right now. The daemon reports it live,
 * so this is the ground truth — not the branch Eva meant to boot on. When work
 * on it is not on GitHub yet, the chip shows the counts and a "Commit & push".
 */
export function SandboxBranchChip({
  branch,
  isSandboxActive,
  intendedBranch,
  gitSync,
  target,
}: SandboxBranchChipProps) {
  const simpleView = useSimpleView();
  const commitAndPush = useAction(api.sandbox.commitAndPushSandbox);
  const [isPushing, setIsPushing] = useState(false);
  // A stopped sandbox has no worktree, so the last report is stale; showing it
  // would state a false live fact.
  if (!isSandboxActive || !branch) return null;

  const uncommitted = gitSync?.uncommittedFiles ?? 0;
  const unpushed = gitSync?.unpushedCommits ?? 0;
  const hasUnpublishedWork = uncommitted > 0 || unpushed > 0;
  // Simple view hides git plumbing, but not work that is not saved yet.
  if (simpleView && !hasUnpublishedWork) return null;

  const handlePush = () => {
    setIsPushing(true);
    commitAndPush({ target })
      .then(() => {
        toast.success(simpleView ? "Saved to GitHub" : `Pushed ${branch}`);
      })
      .catch((error) => {
        toast.error(convexErrorMessage(error, "Couldn't push the branch"));
      })
      .finally(() => setIsPushing(false));
  };

  const pushButton = hasUnpublishedWork ? (
    <button
      type="button"
      disabled={isPushing}
      onClick={handlePush}
      className="motion-press flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-normal text-warning hover:bg-muted active:scale-[0.97] disabled:opacity-60"
    >
      {isPushing ? <Spinner size="sm" /> : <IconUpload size={14} />}
      <span>{simpleView ? "Save to GitHub" : "Commit & push"}</span>
    </button>
  ) : null;

  if (simpleView) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <span className="px-1 text-xs text-warning">Unsaved changes</span>
        {pushButton}
      </div>
    );
  }

  // Eva booted the sandbox on `intendedBranch`, but something inside it (a
  // checkout, a rebase, a stacked branch) moved the worktree. Worth surfacing,
  // not worth shouting about.
  const isMismatched = intendedBranch !== undefined && intendedBranch !== branch;
  const counts = [
    uncommitted > 0 ? `${uncommitted} uncommitted` : null,
    unpushed > 0 ? `${unpushed} unpushed` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <div className="flex min-w-0 items-center">
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
          {counts ? (
            <span className="block text-muted-foreground">
              {counts} — not on GitHub yet
            </span>
          ) : null}
        </TooltipContent>
      </Tooltip>
      {counts ? (
        // Outside the capped branch button, so a long name never hides them.
        <span className="shrink-0 px-1 text-xs text-warning">{counts}</span>
      ) : null}
      {pushButton}
    </div>
  );
}
