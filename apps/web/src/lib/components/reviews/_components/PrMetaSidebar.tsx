"use client";

import { Button, CrossfadeIcon, Spinner } from "@eva/ui";
import { IconClock, IconRefresh } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import type { Id } from "@eva/backend";
import { usePrMetaEdit } from "../usePrMetaEdit";
import { PrMetaEditor, type PrMetaOption } from "./PrMetaEditor";
import { PrMetaSection } from "./PrMetaSection";
import { PrPreviewList } from "./PrPreviewList";
import {
  ReviewStateIcon,
  ToneIcon,
  reviewStateMeta,
  type PrActor,
  type PrLabel,
  type PrOverview,
  type StatusTone,
} from "./prOverviewMeta";
import { countChecks } from "./prMergeState";

/** The words each check outcome answers to in this column, in reading order. */
const CHECK_WORDS: ReadonlyArray<{ tone: StatusTone; word: string }> = [
  { tone: "failure", word: "Failing" },
  { tone: "pending", word: "Unresolved" },
  { tone: "success", word: "Passing" },
  { tone: "neutral", word: "Skipped" },
];

/**
 * The metadata column: who is reviewing, what CI says, how it is labelled, who
 * owns it — GitHub's own furniture, in GitHub's own order, because that is where
 * a reviewer already looks for it.
 *
 * Headings and whitespace only: no card, no rules between sections. This column is
 * reference material beside the conversation, so it must not compete with the
 * header's action cluster for the one piece of attention on the surface.
 *
 * Every section renders, empty or not — the structure is the point, and a reader
 * should be able to tell "nobody is reviewing" from "I am looking in the wrong
 * place". An empty one says so on its own heading line rather than spending a
 * second line on the word "None".
 */
export function PrMetaSidebar({
  repoId,
  overview,
  refreshing,
  onRefresh,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const reviewers =
    overview.reviews.length + overview.requestedReviewers.length;
  const checks = countChecks(overview.checks);
  const edit = usePrMetaEdit(repoId, overview.number, onRefresh);

  const userOptions: PrMetaOption[] = (edit.candidates?.users ?? []).map(
    (user) => ({
      value: user.login,
      label: user.login,
      adornment: <Person login={user.login} avatarUrl={user.avatarUrl} />,
    }),
  );
  const labelOptions: PrMetaOption[] = (edit.candidates?.labels ?? []).map(
    (label) => ({
      value: label.name,
      label: label.name,
      adornment: <LabelDot color={label.color} />,
    }),
  );
  // Only *requested* reviewers are a set eva can edit — someone who has already
  // submitted a review cannot be un-asked, and GitHub rejects the attempt.
  const requestedLogins = overview.requestedReviewers.map(
    (reviewer) => reviewer.login,
  );

  return (
    // `group` for the sections' hover-revealed controls. Sections sit side by side
    // while this is a full-width band above the conversation, and stack once the
    // panel is wide enough to give them a column of their own.
    <aside className="group flex w-full shrink-0 flex-wrap gap-x-8 gap-y-4 [@container(min-width:52rem)]:w-56 [@container(min-width:52rem)]:flex-col [@container(min-width:52rem)]:gap-5">
      <PrMetaSection
        title="Reviewers"
        empty={reviewers === 0 ? "None yet" : undefined}
        action={
          <PrMetaEditor
            title="Reviewers"
            selected={requestedLogins}
            options={userOptions}
            loading={edit.loading}
            saving={edit.savingReviewers}
            onOpen={edit.loadCandidates}
            onToggle={edit.setReviewers}
            emptyMessage="No collaborators found."
          />
        }
      >
        <ul className="space-y-1.5">
          {overview.reviews.map((review) => (
            <li key={review.id} className="flex min-w-0 items-center gap-2">
              <Person
                login={review.authorLogin}
                avatarUrl={review.authorAvatarUrl}
              />
              <a
                href={review.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title={reviewStateMeta(review.state).label}
              >
                <ReviewStateIcon state={review.state} />
                {review.submittedAt ? (
                  <RelativeDateTime
                    at={new Date(review.submittedAt).getTime()}
                  />
                ) : null}
              </a>
            </li>
          ))}
          {overview.requestedReviewers.map((reviewer) => (
            <li
              key={`requested-${reviewer.login}`}
              className="flex min-w-0 items-center gap-2"
            >
              <Person login={reviewer.login} avatarUrl={reviewer.avatarUrl} />
              <span
                className="ml-auto shrink-0 text-muted-foreground"
                title="Awaiting review"
              >
                <IconClock size={13} aria-hidden />
              </span>
            </li>
          ))}
        </ul>
      </PrMetaSection>

      {/* CI at a glance, one line per outcome that actually occurred. The full run
          list is the Checks tab; this is the "is anything red" answer. Refresh sits
          here because checks are the one payload on the surface that changes on its
          own while the reader watches. */}
      <PrMetaSection
        title="Checks"
        empty={checks.total === 0 ? "None yet" : undefined}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh checks"
            title="Refresh checks"
            className="-my-1 size-6 p-0 text-muted-foreground"
          >
            <CrossfadeIcon
              show={refreshing}
              trueKey="loading"
              falseKey="idle"
              variant="soft"
              className="relative flex size-3.5 items-center justify-center"
              whenTrue={<Spinner size="sm" />}
              whenFalse={<IconRefresh size={13} aria-hidden />}
            />
          </Button>
        }
      >
        <ul className="space-y-1">
          {CHECK_WORDS.map(({ tone, word }) => (
            <CheckCount
              key={tone}
              tone={tone}
              count={checks[tone]}
              word={word}
            />
          ))}
        </ul>
      </PrMetaSection>

      {/* Only where something deploys. Most repositories have no preview
          environment at all, and a permanently empty section in a column of five
          teaches the reader to stop reading the column. */}
      {overview.previews.length === 0 ? null : (
        <PrMetaSection title="Previews">
          <PrPreviewList previews={overview.previews} />
        </PrMetaSection>
      )}

      <PrMetaSection
        title="Assignees"
        empty={overview.assignees.length === 0 ? "No one" : undefined}
        action={
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
        }
      >
        <ul className="space-y-1.5">
          {overview.assignees.map((assignee) => (
            <li key={assignee.login} className="min-w-0">
              <Person login={assignee.login} avatarUrl={assignee.avatarUrl} />
            </li>
          ))}
        </ul>
      </PrMetaSection>

      <PrMetaSection
        title="Labels"
        empty={overview.labels.length === 0 ? "None set" : undefined}
        action={
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
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {overview.labels.map((label) => (
            <LabelChip key={label.name} label={label} />
          ))}
        </div>
      </PrMetaSection>
    </aside>
  );
}

/**
 * One outcome of a check run, or nothing at all when none had that outcome —
 * "0 Failing" is a line that says nothing and reads, for a second, as bad news.
 * The icon carries the colour; the words stay muted like the rest of the column.
 */
function CheckCount({
  tone,
  count,
  word,
}: {
  tone: StatusTone;
  count: number;
  word: string;
}) {
  if (count === 0) return null;
  return (
    <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ToneIcon tone={tone} size={13} />
      <span className="tabular-nums text-foreground">{count}</span>
      {word} {count === 1 ? "Check" : "Checks"}
    </li>
  );
}

function Person({ login, avatarUrl }: PrActor) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-4 shrink-0 rounded-full" />
      ) : (
        <span className="size-4 shrink-0 rounded-full bg-muted" />
      )}
      <span className="min-w-0 truncate">{login}</span>
    </span>
  );
}

function LabelChip({ label }: { label: PrLabel }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-muted/60 px-1.5 py-0.5 text-xs">
      <LabelDot color={label.color} />
      {label.name}
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
