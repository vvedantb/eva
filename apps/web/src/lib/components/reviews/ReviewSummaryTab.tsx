"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { isViewableRecap, type api, type Id } from "@eva/backend";
import { Button } from "@eva/ui";
import { IconPencil } from "@tabler/icons-react";
import { Markdown } from "@eva/ui/markdown";
import { PrRecapPanel } from "@/lib/components/sandbox/PrRecapPanel";
import { usePrEdit } from "./usePrEdit";
import { PrCheckRow } from "./_components/PrCheckRow";
import { PrDescriptionEditor } from "./_components/PrDescriptionEditor";
import { checksHeadline, countChecks } from "./_components/prMergeState";
import { MARKDOWN_CLASS, NOTICE_CLASS, type PrOverview } from "./_components/prOverviewMeta";
import { SummaryComments } from "./_components/SummaryComments";
import { SummaryMetaRows } from "./_components/SummaryMetaRows";
import { SummarySection } from "./_components/SummarySection";

type RecapDoc = FunctionReturnType<typeof api.docs.getRecapByPrUrl>;

/**
 * The Summary tab, as t3code lays it out: the label column (reviewers,
 * assignees, labels), then folding sections — Recap (eva's walkthrough, when the
 * pull request has one), Description, Checks, and Comments. Each heading sticks
 * while its body scrolls, so any section can be folded from wherever it has been
 * read to.
 */
export function ReviewSummaryTab({
  repoId,
  prUrl,
  overview,
  recapDoc,
  onChanged,
}: {
  repoId: Id<"githubRepos">;
  prUrl: string | undefined;
  overview: PrOverview;
  recapDoc: RecapDoc | undefined;
  onChanged: () => void;
}) {
  const checks = countChecks(overview.checks);
  const hasRecap =
    recapDoc !== undefined && recapDoc !== null && isViewableRecap(recapDoc);

  return (
    <div className="h-full overflow-y-auto pb-20">
      <div className="mx-auto max-w-4xl">
        <SummaryMetaRows repoId={repoId} overview={overview} onChanged={onChanged} />

        {/* Open when there is a walkthrough to read, folded to its Generate
            control when there is not. Keyed on that, so the default re-applies
            once the recap query settles. */}
        <SummarySection
          key={`recap:${hasRecap}`}
          title="Recap"
          defaultOpen={hasRecap}
        >
          <div className="h-[36rem] overflow-hidden rounded-lg bg-card">
            <PrRecapPanel prUrl={prUrl} repoId={repoId} recapDoc={recapDoc} />
          </div>
        </SummarySection>

        <SummarySection title="Description">
          <SummaryDescription repoId={repoId} overview={overview} />
        </SummarySection>

        <SummarySection
          title={
            checks.total === 0
              ? "Checks"
              : `Checks · ${checksHeadline(checks)}`
          }
          defaultOpen={false}
        >
          {checks.total === 0 ? (
            <p className="text-xs text-muted-foreground">No checks reported.</p>
          ) : (
            <ul className="space-y-0.5">
              {overview.checks.map((check) => (
                <li key={`${check.kind}-${check.name}`}>
                  <PrCheckRow check={check} />
                </li>
              ))}
            </ul>
          )}
          {overview.checksTruncated ? (
            <p className={`${NOTICE_CLASS} mt-2`}>
              Only the first {overview.checks.length} checks are shown.
            </p>
          ) : null}
        </SummarySection>

        <SummaryComments overview={overview} />
      </div>
    </div>
  );
}

/**
 * The description, rendered, with a pencil beside it. One piece of state holds
 * both halves of the editor: a string is the draft being written, `null` means
 * it is being read.
 */
function SummaryDescription({
  repoId,
  overview,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const edit = usePrEdit(repoId, overview.number, () => setDraft(null));
  const body = overview.body ?? "";

  if (draft !== null) {
    return (
      <PrDescriptionEditor
        draft={draft}
        onDraftChange={setDraft}
        onCancel={() => setDraft(null)}
        onSave={() => edit.save({ body: draft })}
        saving={edit.saving}
        error={edit.error}
      />
    );
  }

  return (
    <div className="group flex items-start gap-1">
      {body.trim().length > 0 ? (
        <Markdown className={`${MARKDOWN_CLASS} min-w-0 flex-1`}>{body}</Markdown>
      ) : (
        <p className="min-w-0 flex-1 text-sm italic text-muted-foreground">
          No description provided.
        </p>
      )}
      <Button
        size="icon-xs"
        variant="ghost"
        className="reveal-on-hover shrink-0"
        aria-label="Edit description"
        onClick={() => setDraft(body)}
      >
        <IconPencil aria-hidden />
      </Button>
    </div>
  );
}
