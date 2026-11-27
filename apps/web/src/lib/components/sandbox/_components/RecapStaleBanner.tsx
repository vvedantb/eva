"use client";

import type { ReactNode } from "react";
import type { Id } from "@eva/backend";
import { IconAlertTriangle } from "@tabler/icons-react";
import { usePrDiff } from "@/lib/components/sandbox/usePrDiff";

interface RecapStaleBannerProps {
  prUrl: string;
  repoId: Id<"githubRepos">;
  /** The head commit the recap was written for. */
  recapSha: string;
  /** The way to bring the recap up to date, e.g. a Regenerate button. */
  action?: ReactNode;
}

/**
 * Warns that the PR moved on after its recap was written. The current head
 * comes from the PR diff query the walkthrough already loads (same cache key),
 * so the check costs no extra request on a surface that shows the diff.
 */
export function RecapStaleBanner({
  prUrl,
  repoId,
  recapSha,
  action,
}: RecapStaleBannerProps) {
  const { state } = usePrDiff(prUrl, repoId);
  if (state.status !== "ready" || state.headSha === recapSha) return null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-warning/5 px-3 py-2 text-sm text-warning">
      <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Recap is out of date</p>
        <p className="text-warning/80">
          This recap is for{" "}
          <span className="font-mono">{recapSha.slice(0, 7)}</span>. The pull
          request has new commits.
        </p>
      </div>
      {action}
    </div>
  );
}
