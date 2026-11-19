"use client";

import { Link } from "@tanstack/react-router";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@vvedantb/ui";
import { IconStack2 } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { StatusTone } from "./prOverviewMeta";
import { PrRow } from "@/lib/components/pr-menu/PrRow";
import { stackVerdict, type PrStack } from "@eva/shared";

const VERDICT_TONE_CLASS: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-emerald-300",
  failure: "text-destructive",
  pending: "text-muted-foreground",
  neutral: "text-muted-foreground",
};

/**
 * The header's stack control: a quiet "2/4" chip that opens the whole stack,
 * drawn top-down the way a reader pictures it — newest work on top, the base
 * branch at the foot. Each row opens that pull request's review.
 */
export function PrStackPopover({ stack }: { stack: PrStack }) {
  const { basePath } = useRepo();
  const verdict = stackVerdict(stack);
  const entriesTopDown = stack.entries.toReversed();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className="shrink-0 gap-1 rounded-full bg-muted/60 px-2 font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Stack #${stack.number}, pull request ${stack.position} of ${stack.size}`}
          title={`Stack #${stack.number} · PR ${stack.position} of ${stack.size} · targets ${stack.baseRef}`}
        >
          <IconStack2 size={13} aria-hidden />
          <span className="tabular-nums">
            {stack.position}/{stack.size}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-3 pt-3 pb-2">
          <p
            className={cn(
              "text-sm font-medium",
              VERDICT_TONE_CLASS[verdict.tone],
            )}
          >
            {verdict.label}
          </p>
          <p className="text-xs text-muted-foreground">
            Stack #{stack.number} · targets {stack.baseRef}
          </p>
        </div>
        <ol className="max-h-80 overflow-y-auto px-1.5 pb-1.5">
          {entriesTopDown.map((entry) => {
            const current = entry.position === stack.position;
            return (
              <li key={entry.number}>
                <Link
                  to={toInternalRepoHref(
                    `${basePath}/reviews/${entry.number}/overview`,
                  )}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-menu-item px-2 py-1.5",
                    current ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <PrRow
                    status={entry.status}
                    draft={entry.draft}
                    title={entry.title}
                    number={entry.number}
                    branch={entry.headRef}
                  />
                </Link>
              </li>
            );
          })}
          <li className="flex items-center gap-2.5 px-2 py-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="ml-0.5 size-2.5 shrink-0 rounded-full border border-muted-foreground/50"
            />
            <span className="truncate">{stack.baseRef}</span>
          </li>
        </ol>
      </PopoverContent>
    </Popover>
  );
}
