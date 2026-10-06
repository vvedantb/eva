"use client";

import type { Id } from "@eva/backend";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@eva/ui";
import {
  IconRocket,
  IconTag,
  IconUserCheck,
  IconUsers,
} from "@tabler/icons-react";
import { usePrMetaEdit } from "../usePrMetaEdit";
import { PrMetaEditor, type PrMetaOption } from "./PrMetaEditor";
import { PrPreviewList } from "./PrPreviewList";
import { reviewStateMeta, type PrLabel, type PrOverview } from "./prOverviewMeta";
import { PrAvatar } from "./prReviewParts";
import { SummaryMetaRow } from "./SummarySection";

/**
 * A verdict rides the face that earned it rather than a row of its own: the
 * ring replaces the separator between overlapping avatars, so it costs no size.
 */
const VERDICT_RING: Record<string, string> = {
  APPROVED: "ring-emerald-500",
  CHANGES_REQUESTED: "ring-destructive",
};

/**
 * The top of Summary: who is reviewing, who owns it, how it is labelled, and
 * where it deploys — t3code's label column, with the pencil that edits each set
 * at the end of its row.
 */
export function SummaryMetaRows({
  repoId,
  overview,
  onChanged,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onChanged: () => void;
}) {
  const edit = usePrMetaEdit(repoId, overview.number, onChanged);
  const userOptions: PrMetaOption[] = (edit.candidates?.users ?? []).map(
    (user) => ({
      value: user.login,
      label: user.login,
      adornment: <PrAvatar login={user.login} avatarUrl={user.avatarUrl} />,
    }),
  );
  const labelOptions: PrMetaOption[] = (edit.candidates?.labels ?? []).map(
    (label) => ({
      value: label.name,
      label: label.name,
      adornment: <LabelDot color={label.color} />,
    }),
  );
  const reviewers = [
    ...overview.reviews.map((review) => ({
      login: review.authorLogin,
      avatarUrl: review.authorAvatarUrl,
      state: review.state,
    })),
    ...overview.requestedReviewers.map((reviewer) => ({
      login: reviewer.login,
      avatarUrl: reviewer.avatarUrl,
      state: "REQUESTED",
    })),
  ];

  return (
    <section className="space-y-1 px-4 pt-3 pb-1">
      <SummaryMetaRow icon={<IconUsers size={13} aria-hidden />} label="Reviewers">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {reviewers.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <span className="flex items-center -space-x-1">
              {reviewers.map((reviewer) => (
                <Tooltip key={reviewer.login}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "relative rounded-full ring-2 ring-background hover:z-10",
                        VERDICT_RING[reviewer.state],
                        reviewer.state === "REQUESTED" && "opacity-60",
                      )}
                    >
                      <PrAvatar
                        login={reviewer.login}
                        avatarUrl={reviewer.avatarUrl}
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {reviewer.login} —{" "}
                    {reviewer.state === "REQUESTED"
                      ? "Awaiting review"
                      : reviewStateMeta(reviewer.state).label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </span>
          )}
          <PrMetaEditor
            title="Reviewers"
            // Only *requested* reviewers can be un-asked; GitHub rejects the rest.
            selected={overview.requestedReviewers.map((r) => r.login)}
            options={userOptions}
            loading={edit.loading}
            saving={edit.savingReviewers}
            onOpen={edit.loadCandidates}
            onToggle={edit.setReviewers}
            emptyMessage="No collaborators found."
          />
        </span>
      </SummaryMetaRow>

      <SummaryMetaRow
        icon={<IconUserCheck size={13} aria-hidden />}
        label="Assignees"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {overview.assignees.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            overview.assignees.map((assignee) => (
              <span key={assignee.login} className="flex items-center gap-1">
                <PrAvatar login={assignee.login} avatarUrl={assignee.avatarUrl} />
                {assignee.login}
              </span>
            ))
          )}
          <PrMetaEditor
            title="Assignees"
            selected={overview.assignees.map((assignee) => assignee.login)}
            options={userOptions}
            loading={edit.loading}
            saving={edit.savingAssignees}
            onOpen={edit.loadCandidates}
            onToggle={edit.setAssignees}
            emptyMessage="No collaborators found."
          />
        </span>
      </SummaryMetaRow>

      <SummaryMetaRow icon={<IconTag size={13} aria-hidden />} label="Labels">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {overview.labels.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            overview.labels.map((label) => (
              <LabelChip key={label.name} label={label} />
            ))
          )}
          <PrMetaEditor
            title="Labels"
            selected={overview.labels.map((label) => label.name)}
            options={labelOptions}
            loading={edit.loading}
            saving={edit.savingLabels}
            onOpen={edit.loadCandidates}
            onToggle={edit.setLabels}
            emptyMessage="This repository has no labels."
          />
        </span>
      </SummaryMetaRow>

      {/* Only where something deploys: most repositories have no preview. */}
      {overview.previews.length === 0 ? null : (
        <SummaryMetaRow icon={<IconRocket size={13} aria-hidden />} label="Previews">
          <PrPreviewList previews={overview.previews} />
        </SummaryMetaRow>
      )}
    </section>
  );
}

function LabelChip({ label }: { label: PrLabel }) {
  return (
    <span className="inline-flex max-w-48 items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-xs">
      <LabelDot color={label.color} />
      <span className="truncate">{label.name}</span>
    </span>
  );
}

/**
 * Label colours come from GitHub as data, so they cannot be theme tokens; keeping
 * them to a dot is what keeps contrast safe in both themes.
 */
function LabelDot({ color }: { color: string }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: `#${color}` }}
    />
  );
}
