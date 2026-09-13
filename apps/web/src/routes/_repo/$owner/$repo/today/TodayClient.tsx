"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, DAILY_STANDUP_KEY } from "@eva/backend";
import { cn, STREAMDOWN_TABLE_RADIUS_CLASS } from "@eva/ui";
import { Streamdown } from "streamdown";
import { safeStreamdownMediaComponents } from "@/lib/markdown/safeStreamdownMedia";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { IconSunrise } from "@tabler/icons-react";
import dayjs from "dayjs";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { TimelineEntriesSkeleton } from "@/lib/components/ui/TimelineEntriesSkeleton";
import { useRepo } from "@/lib/contexts/RepoContext";
import { withMutationToast } from "@/lib/utils/mutationToast";

/** Same plugin set as the changelog surfaces, so all three render identically. */
const standupPlugins = { cjk, math, mermaid };

/**
 * A standup is a lead line plus a couple of `###` theme headings, so the
 * default heading scale swamps the bullets it labels. Demote headings to a
 * quiet section label and tighten list spacing to keep each card skimmable.
 */
const standupProseClass =
  "text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 " +
  "[&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-xs " +
  "[&_h1]:font-medium [&_h2]:font-medium [&_h3]:font-medium [&_h4]:font-medium " +
  "[&_h1]:uppercase [&_h2]:uppercase [&_h3]:uppercase [&_h4]:uppercase " +
  "[&_h1]:tracking-wide [&_h2]:tracking-wide [&_h3]:tracking-wide [&_h4]:tracking-wide " +
  "[&_h1]:text-muted-foreground [&_h2]:text-muted-foreground [&_h3]:text-muted-foreground [&_h4]:text-muted-foreground " +
  "[&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-4 [&_h4]:mt-4 " +
  "[&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1.5 [&_h4]:mb-1.5 " +
  "[&_ul]:my-0 [&_li]:my-0.5 [&_p]:my-1.5";

/** "Today" / "Yesterday" for the two freshest entries, dates beyond that. */
function entryHeading(publishedAt: number): string {
  const published = dayjs(publishedAt);
  if (published.isSame(dayjs(), "day")) return "Today";
  if (published.isSame(dayjs().subtract(1, "day"), "day")) return "Yesterday";
  return published.format("dddd, MMM D, YYYY");
}

/**
 * Every published run of this app's "Daily standup" system automation as a
 * changelog-style timeline. The sidebar tab only shows while the automation is
 * enabled, but the page stays reachable by URL so history is never lost.
 */
export function TodayClient() {
  const { repoId } = useRepo();
  const entries = useQuery(api.today.listStandups, { repoId });
  const enabled = useQuery(api.today.isStandupEnabled, { repoId });
  const install = useMutation(api.automations.installSystemAutomation);

  return (
    <PageWrapper title="Today" comfortable>
      {entries === undefined ? (
        <TimelineEntriesSkeleton aria-label="Loading standups" />
      ) : entries.length === 0 ? (
        enabled === false ? (
          <EmptyState
            icon={<IconSunrise size={24} />}
            title="Daily standup is off"
            description="Turn on the Daily standup automation and eva will post a short summary of what shipped here every morning."
            actionLabel="Turn on Daily standup"
            onAction={() => {
              void withMutationToast(
                install({ repoId, key: DAILY_STANDUP_KEY }),
                "Daily standup switched on",
                "Couldn't switch on Daily standup",
                "daily-standup-install",
              );
            }}
          />
        ) : (
          <EmptyState
            icon={<IconSunrise size={24} />}
            title="No standups yet"
            description="The Daily standup automation is on — its first summary will show up here after the next scheduled run."
          />
        )
      ) : (
        // The rail is drawn on the list, not per entry, so it runs unbroken
        // between cards instead of restarting at each one.
        <ol className="relative space-y-4 border-l border-border pl-6 sm:pl-8">
          {entries.map((entry, index) => (
            <li key={entry.id} className="relative">
              <span
                className={cn(
                  "absolute -left-6 top-4 size-2 rounded-full ring-4 ring-background sm:-left-8",
                  index === 0 ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />
              <article className="rounded-surface bg-card">
                <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">
                    {entryHeading(entry.publishedAt)}
                  </h2>
                  <time
                    dateTime={dayjs(entry.publishedAt).toISOString()}
                    className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                  >
                    {dayjs(entry.publishedAt).format("MMM D, HH:mm")}
                  </time>
                </header>
                <div className="px-4 py-3">
                  <Streamdown
                    className={cn(
                      standupProseClass,
                      STREAMDOWN_TABLE_RADIUS_CLASS,
                    )}
                    plugins={standupPlugins}
                    components={safeStreamdownMediaComponents}
                  >
                    {entry.content}
                  </Streamdown>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </PageWrapper>
  );
}
