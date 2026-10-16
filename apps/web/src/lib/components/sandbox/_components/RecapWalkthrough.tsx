"use client";

import { useState, type ReactNode } from "react";
import type { Id, RecapWalkthroughStep } from "@eva/backend";
import { Button, Spinner, Surface, cn } from "@eva/ui";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { Markdown } from "@eva/ui/markdown";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { ReviewableFileDiff } from "@/lib/components/sandbox/ReviewableFileDiff";
import {
  usePrDiff,
  type PrDiffState,
} from "@/lib/components/sandbox/usePrDiff";
import { useDiffIgnoreWhitespace } from "@/lib/components/sandbox/useDiffIgnoreWhitespace";
import { DiffFileLazyBody } from "@/lib/components/sandbox/DiffFileLazyBody";
import { applyIgnoreWhitespace } from "@/lib/components/sandbox/diffFiles";
import { RecapAskAgentButton } from "./RecapAskAgentButton";

interface RecapWalkthroughProps {
  steps: readonly RecapWalkthroughStep[];
  prUrl: string;
  prNumber: number;
  repoId: Id<"githubRepos">;
  /**
   * The scrolling ancestor. File diffs mount only when near it, as in the Code
   * tab: a step can hold every file of a large PR ("Other changes").
   */
  scrollRoot: HTMLElement | null;
}

/**
 * A recap's guided tour, rendered natively: a rail of steps, then the current
 * step's summary, its "Look closely" call when it has one, and the real PR diff
 * of each file it covers. Where a review is in progress (a pending-comments
 * provider above), the diffs take line comments like the Code tab's, drawn on
 * the same patch (the shared ignore-whitespace setting), so a comment sits on
 * the same lines in both views.
 */
export function RecapWalkthrough({
  steps,
  prUrl,
  prNumber,
  repoId,
  scrollRoot,
}: RecapWalkthroughProps) {
  const [index, setIndex] = useState(0);
  const { state: rawState } = usePrDiff(prUrl, repoId);
  const [ignoreWhitespace] = useDiffIgnoreWhitespace();
  const state: PrDiffState =
    rawState.status === "ready" && ignoreWhitespace
      ? { ...rawState, entries: applyIgnoreWhitespace(rawState.entries) }
      : rawState;
  const workBranch = rawState.status === "ready" ? rawState.workBranch : null;
  // A regenerated recap can have fewer steps than the one being read.
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  if (step === undefined) return null;

  // A new step starts at its top, not wherever the last one was scrolled to.
  const goTo = (next: number) => {
    setIndex(next);
    scrollRoot?.scrollTo({ top: 0 });
  };

  return (
    <div className="flex min-h-0 gap-4">
      <nav
        aria-label="Recap steps"
        className="hidden w-56 shrink-0 flex-col gap-0.5 md:flex"
      >
        {steps.map((entry, entryIndex) => (
          <button
            key={`${entryIndex}:${entry.title}`}
            type="button"
            aria-current={entryIndex === current ? "step" : undefined}
            onClick={() => goTo(entryIndex)}
            className={cn(
              "motion-press flex items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm active:scale-[0.98]",
              entryIndex === current
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span className="w-4 shrink-0 text-xs tabular-nums">
              {entryIndex + 1}
            </span>
            <span className="min-w-0">{entry.title}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-base font-semibold">
            {step.title}
          </h3>
          <RecapAskAgentButton
            step={step}
            prUrl={prUrl}
            prNumber={prNumber}
            workBranch={workBranch}
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            {current + 1} / {steps.length}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous step"
            disabled={current === 0}
            onClick={() => goTo(current - 1)}
          >
            <IconChevronLeft size={16} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next step"
            disabled={current === steps.length - 1}
            onClick={() => goTo(current + 1)}
          >
            <IconChevronRight size={16} />
          </Button>
        </div>

        <Markdown className="text-sm">{step.summary}</Markdown>

        {step.lookClosely !== undefined ? (
          <Surface
            density="tight"
            className="flex items-start gap-2 bg-warning-bg text-sm text-warning-strong"
          >
            <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Look closely</p>
              <p>{step.lookClosely}</p>
            </div>
          </Surface>
        ) : null}

        {step.files.map((path, fileIndex) => (
          <StepFileDiff
            key={path}
            path={path}
            state={state}
            scrollRoot={scrollRoot}
            eager={fileIndex === 0}
          />
        ))}
      </div>
    </div>
  );
}

/** One file of a step: its PR diff, or why it cannot be shown. */
function StepFileDiff({
  path,
  state,
  scrollRoot,
  eager,
}: {
  path: string;
  state: PrDiffState;
  scrollRoot: HTMLElement | null;
  /** The step's first file renders at once: it is in view on arrival. */
  eager: boolean;
}) {
  const { resolvedTheme } = useThemeMode();
  if (state.status === "loading") {
    return (
      <FileNote path={path}>
        <Spinner size="sm" />
      </FileNote>
    );
  }
  if (state.status === "error") {
    return <FileNote path={path}>Couldn't load the diff.</FileNote>;
  }
  const entry = state.entries.find((candidate) => candidate.path === path);
  if (entry === undefined) {
    return (
      <FileNote path={path}>
        Not in the current diff. It may be past the size limit, or a later
        commit removed the change.
      </FileNote>
    );
  }
  if (entry.binary || !entry.hasHunks) {
    return <FileNote path={path}>No line changes to show.</FileNote>;
  }
  return (
    <div className="overflow-hidden rounded-surface bg-card">
      <DiffFileLazyBody
        additions={entry.additions}
        deletions={entry.deletions}
        contextLines={entry.contextLines}
        hunkCount={entry.hunkCount}
        diffView="unified"
        scrollRoot={scrollRoot}
        eager={eager}
      >
        <ReviewableFileDiff
          patch={entry.patch}
          path={entry.path}
          diffView="unified"
          resolvedTheme={resolvedTheme}
          wrapLines
        />
      </DiffFileLazyBody>
    </div>
  );
}

function FileNote({ path, children }: { path: string; children: ReactNode }) {
  return (
    <Surface density="tight" className="space-y-1 text-sm">
      <p className="font-mono text-xs">{path}</p>
      <div className="text-muted-foreground">{children}</div>
    </Surface>
  );
}
