"use client";

import {
  INCOMPLETE_PR_RECAP_MESSAGE,
  isIncompleteReadyRecap,
  type Id,
  type RecapWalkthroughStep,
} from "@eva/backend";
import { HtmlPreviewFrame } from "@/lib/components/docs/_components/HtmlPreviewFrame";
import { prNumberFromGithubUrl } from "@/lib/githubPr";
import { RecapWalkthrough } from "./RecapWalkthrough";

interface RecapTourBodyProps {
  doc: {
    recapWalkthrough?: RecapWalkthroughStep[];
    html?: string;
    prUrl?: string;
    prRecapStatus?: "pending" | "ready" | "error";
  };
  /** Repo the PR diff is read through: the surface's app repo. */
  repoId: Id<"githubRepos">;
}

/**
 * The Recap tab body, shared by the sandbox panel and Documents: the native
 * walkthrough, else the HTML page a recap stored before walkthroughs existed,
 * else why there is nothing to show.
 */
export function RecapTourBody({ doc, repoId }: RecapTourBodyProps) {
  const prNumber =
    doc.prUrl !== undefined ? prNumberFromGithubUrl(doc.prUrl) : undefined;
  const steps = doc.recapWalkthrough ?? [];

  if (steps.length > 0 && doc.prUrl !== undefined && prNumber !== undefined) {
    return (
      <RecapWalkthrough
        steps={steps}
        prUrl={doc.prUrl}
        prNumber={prNumber}
        repoId={repoId}
      />
    );
  }
  if (doc.html) {
    return <HtmlPreviewFrame html={doc.html} title="PR recap" />;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {isIncompleteReadyRecap(doc) || doc.prRecapStatus === "error"
        ? INCOMPLETE_PR_RECAP_MESSAGE
        : "No recap yet. It is created the next time this review runs."}
    </p>
  );
}
