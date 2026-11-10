"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { IconUpload } from "@tabler/icons-react";
import { api, type Doc } from "@eva/backend";
import {
  Button,
  Spinner,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  convexErrorMessage,
} from "@vvedantb/ui";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

type SandboxGitTarget = FunctionArgs<
  typeof api.sandbox.commitAndPushSandbox
>["target"];

/**
 * Header control beside the sandbox stop button: commits and pushes the
 * branch the sandbox is on. Shown only while work there is not on GitHub
 * (the daemon reports `sandboxGitSync` live); the counts sit in the tooltip.
 * Simple view keeps it, worded for non-developers, because unsaved work is
 * exactly what that view must not hide.
 */
export function SandboxCommitPushButton({
  gitSync,
  isSandboxActive,
  target,
  size = "sm",
}: {
  gitSync: Doc<"sessions">["sandboxGitSync"];
  isSandboxActive: boolean;
  target: SandboxGitTarget;
  /** Task and project footers run the larger icon button; headers stay compact. */
  size?: "sm" | "default";
}) {
  const simpleView = useSimpleView();
  const commitAndPush = useAction(api.sandbox.commitAndPushSandbox);
  const [isPushing, setIsPushing] = useState(false);

  const uncommitted = gitSync?.uncommittedFiles ?? 0;
  const unpushed = gitSync?.unpushedCommits ?? 0;
  // A stopped sandbox has no worktree, so the last report is stale.
  if (!isSandboxActive || (uncommitted === 0 && unpushed === 0)) return null;

  const label = simpleView ? "Save to GitHub" : "Commit & push";
  const counts = [
    uncommitted > 0
      ? `${uncommitted} uncommitted ${uncommitted === 1 ? "file" : "files"}`
      : null,
    unpushed > 0
      ? `${unpushed} unpushed ${unpushed === 1 ? "commit" : "commits"}`
      : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  const handlePush = () => {
    setIsPushing(true);
    commitAndPush({ target })
      .then(() => {
        toast.success(simpleView ? "Saved to GitHub" : "Pushed to GitHub");
      })
      .catch((error) => {
        toast.error(convexErrorMessage(error, "Couldn't push the branch"));
      })
      .finally(() => setIsPushing(false));
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size={size === "sm" ? "icon-sm" : "icon"}
          variant="secondary"
          onClick={handlePush}
          disabled={isPushing}
          className="text-warning"
          aria-label={`${label}: ${counts}`}
        >
          {isPushing ? (
            <Spinner size="sm" />
          ) : (
            <IconUpload className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="block">{label}</span>
        <span className="block text-muted-foreground">
          {counts} not on GitHub yet
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
