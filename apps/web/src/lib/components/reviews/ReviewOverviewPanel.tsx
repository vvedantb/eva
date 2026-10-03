"use client";

import type { Id } from "@eva/backend";
import { Button, Spinner, cn } from "@eva/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { PrOverviewState } from "./usePrOverview";
import { REVIEW_TAB_COLUMN_CLASS } from "./_components/prOverviewMeta";
import { PrCommentComposer } from "./_components/PrCommentComposer";
import { PrDescriptionSection } from "./_components/PrDescriptionSection";
import { PrLifecycleEventCard } from "./_components/PrLifecycleEventCard";
import { PrMetaSidebar } from "./_components/PrMetaSidebar";
import { PrTimeline } from "./_components/PrTimeline";

/**
 * The Activity tab shared by the standalone Reviews page and the sandbox Review
 * tab: the metadata, the description, and the conversation, so a review needs no
 * trip to GitHub.
 *
 * Conversation on the left, metadata in a column on the right, as on GitHub — but
 * no cards. This was a grid of six bordered blocks that gave the description, the
 * composer, the merge box, and a sidebar of empty sections the same visual weight,
 * so nothing led. Regions are named by a label and separated by whitespace instead;
 * the only box left is the thing that really is an object rather than prose: the
 * comment editor.
 *
 * The merge decision is not here. It used to close the column, which put the one
 * irreversible control on the surface below a conversation of unbounded length;
 * it lives in the header now, on screen from every tab.
 *
 * The payload is passed in rather than read here: the shared header above the tab
 * row shows the same overview, and one reader keeps the two in step.
 */
export function ReviewOverviewPanel({
  repoId,
  prNumber,
  state,
  reload,
}: {
  repoId: Id<"githubRepos">;
  prNumber: number;
  state: PrOverviewState;
  reload: () => void;
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <IconAlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{state.message}</p>
        <Button size="sm" variant="secondary" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }

  const { overview } = state;

  return (
    // `h-full`, not `flex-1`: the sandbox Review tab mounts this inside a plain
    // block TabsContent, where a flex item's basis never resolves and the
    // scroll container ends up unbounded.
    // A container, not a media query: the same panel is the whole Reviews page
    // and a narrow pane in a session, and only its own width decides whether the
    // metadata can afford a column beside the conversation.
    <div className="@container h-full overflow-auto">
      {/* Capped for measure, not for the viewport: this holds agent-written
          markdown, and a description set across a 1600px page is unreadable. */}
      <div
        className={cn(
          REVIEW_TAB_COLUMN_CLASS,
          "gap-6 [@container(min-width:52rem)]:flex-row [@container(min-width:52rem)]:gap-8",
        )}
      >
        {/* First in the source so the metadata leads when it is a band across
            the top, and ordered back to the right once it is a column. */}
        <PrMetaSidebar
          repoId={repoId}
          overview={overview}
          refreshing={state.refreshing}
          onRefresh={reload}
        />
        <div className="min-w-0 flex-1 space-y-6 [@container(min-width:52rem)]:order-first">
          {/* First, above even the description: "did this ship?" is the question a
              reader opens a finished pull request with, and chronologically the
              merge is the last thing that happened to it. Null while it is open —
              nothing has happened to it yet. */}
          {overview.status === "open" ? null : (
            <PrLifecycleEventCard
              status={overview.status}
              overview={overview}
            />
          )}
          <PrDescriptionSection repoId={repoId} overview={overview} />
          <PrTimeline repoId={repoId} overview={overview} />
          <PrCommentComposer
            repoId={repoId}
            prNumber={prNumber}
            onPosted={reload}
          />
        </div>
      </div>
    </div>
  );
}
