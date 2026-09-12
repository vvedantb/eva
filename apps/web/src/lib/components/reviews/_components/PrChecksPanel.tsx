"use client";

import { Button, Spinner, Surface, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { IconRefresh } from "@tabler/icons-react";
import { checksHeadline, checksOverallTone, countChecks } from "./prMergeState";
import { PrCheckRow } from "./PrCheckRow";
import { NOTICE_CLASS, ToneIcon, type PrOverview } from "./prOverviewMeta";

/**
 * The Checks tab: every check run and commit status on the head commit, under
 * one verdict line.
 *
 * These used to be reachable only by expanding a row inside the merge control,
 * which put "is CI broken" behind two clicks and a scroll. CI is one of the four
 * questions a reviewer opens a pull request with, so it gets a tab.
 *
 * Refresh lives here rather than in the page chrome: checks are the one payload
 * on the surface that changes on its own while the reader watches.
 */
export function PrChecksPanel({
  overview,
  refreshing,
  onRefresh,
}: {
  overview: PrOverview;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const counts = countChecks(overview.checks);
  const tone = checksOverallTone(counts);
  const headline =
    counts.total === 0 ? "Nothing has reported yet" : checksHeadline(counts);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={`${headline}-${tone}`}
                className="flex min-w-0 w-full items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <ToneIcon tone={tone} size={15} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {headline}
                </span>
              </m.span>
            </AnimatePresence>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh checks"
            title="Refresh checks"
            className="size-7 shrink-0 p-0 text-muted-foreground"
          >
            {refreshing ? (
              <Spinner size="sm" />
            ) : (
              <IconRefresh size={14} aria-hidden />
            )}
          </Button>
        </div>

        {counts.total === 0 ? (
          <p className={NOTICE_CLASS}>
            No check runs or commit statuses have reported on{" "}
            <span className="font-mono">{overview.headRef}</span> yet.
          </p>
        ) : (
          <Surface density="none" className="overflow-hidden p-1.5">
            <ul className="space-y-0.5">
              {overview.checks.map((check, index) => (
                <li key={`${check.kind}-${check.name}`}>
                  <ListEnter index={index} fast>
                    <PrCheckRow check={check} />
                  </ListEnter>
                </li>
              ))}
            </ul>
          </Surface>
        )}

        {overview.checksTruncated ? (
          <p className={NOTICE_CLASS}>
            Only the first {overview.checks.length} checks are shown.
          </p>
        ) : null}
      </div>
    </div>
  );
}
