"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { api, type TodayItem } from "@eva/backend";
import { cn } from "@eva/ui";
import {
  entityHref,
  standupEntryHeading,
  standupEntryTime,
  TODAY_UPDATE_TITLE,
  todayMergedSince,
  todaySections,
} from "@eva/shared";
import {
  CenteredSpinner,
  EmptyState,
  LoadingState,
  Markdown,
  RelativeDateTime,
  staggerDelay,
  tokenTransition,
} from "@vvedantb/ui";
import { m } from "motion/react";
import { IconSunrise } from "@tabler/icons-react";
import dayjs from "dayjs";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { AwaitingAnswerMark } from "@/lib/components/ui/AwaitingAnswerMark";
import { statusMeta } from "@/lib/components/reviews/_components/prOverviewMeta";
import { SESSIONS_LEADING_SLOT } from "@/lib/components/sidebar/_utils/sessionsSidebarLayout";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

/**
 * A standup is a lead line plus a couple of `###` theme headings, so the
 * default heading scale swamps the bullets it labels. Demote headings to a
 * quiet section label and tighten list spacing to keep the card skimmable.
 */
const standupProseClass =
  "text-sm " +
  "[&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_h4]:text-xs " +
  "[&_h1]:font-medium [&_h2]:font-medium [&_h3]:font-medium [&_h4]:font-medium " +
  "[&_h1]:uppercase [&_h2]:uppercase [&_h3]:uppercase [&_h4]:uppercase " +
  "[&_h1]:tracking-wide [&_h2]:tracking-wide [&_h3]:tracking-wide [&_h4]:tracking-wide " +
  "[&_h1]:text-muted-foreground [&_h2]:text-muted-foreground [&_h3]:text-muted-foreground [&_h4]:text-muted-foreground " +
  "[&_h1]:mt-4 [&_h2]:mt-4 [&_h3]:mt-4 [&_h4]:mt-4 " +
  "[&_h1]:mb-1.5 [&_h2]:mb-1.5 [&_h3]:mb-1.5 [&_h4]:mb-1.5 " +
  "[&_ul]:my-0 [&_li]:my-0.5 [&_p]:my-1.5";

/**
 * Section title in sentence case, as the review surface's labels: caps at this
 * size read as a form. The count beside it is muted and tabular.
 */
const sectionTitleClass =
  "mb-2 flex items-baseline gap-1.5 px-4 text-sm font-medium text-foreground";

/**
 * The signed-in user's live dashboard for this repo (`today.dashboard`):
 * Needs you, In progress and Merged (shared `todaySections`, empty ones
 * hidden), then the latest Daily standup as an Update while the standup is on.
 */
export function TodayClient() {
  const { repoId } = useRepo();
  const dashboard = useQuery(api.today.dashboard, {
    repoId,
    mergedSince: todayMergedSince(Date.now()),
  });

  return (
    <PageWrapper title="Today" comfortable>
      {dashboard === undefined ? (
        <CenteredSpinner label="Loading Today" />
      ) : (
        <TodayBody dashboard={dashboard} />
      )}
    </PageWrapper>
  );
}

function TodayBody({
  dashboard,
}: {
  dashboard: FunctionReturnType<typeof api.today.dashboard>;
}) {
  const sections = dashboard ? todaySections(dashboard) : [];
  const standup = dashboard?.standup ?? null;
  if (sections.length === 0 && standup === null) {
    return (
      <EmptyState.Root>
        <EmptyState.Icon icon={IconSunrise} size={24} />
        <EmptyState.Title>Nothing needs you</EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    // A reading measure: a title and its time stay close enough to scan as one line.
    <div className="max-w-3xl space-y-8">
      {sections.map((section, index) => (
        <m.section
          key={section.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...tokenTransition.base, delay: staggerDelay(index) }}
        >
          <h2 className={sectionTitleClass}>
            {section.title}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {section.items.length}
            </span>
          </h2>
          <ul className="rounded-surface bg-card p-1">
            {section.items.map((item) => (
              <TodayRow
                key={item.id}
                item={item}
                awaitingAnswer={section.id === "needsMe"}
              />
            ))}
          </ul>
        </m.section>
      ))}
      {standup ? (
        <m.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            ...tokenTransition.base,
            delay: staggerDelay(sections.length),
          }}
        >
          <h2 className={sectionTitleClass}>{TODAY_UPDATE_TITLE}</h2>
          <article className="rounded-surface bg-card">
            <header className="flex items-center justify-between gap-2 px-4 pt-3">
              <h3 className="text-sm font-semibold">
                {standupEntryHeading(standup.publishedAt)}
              </h3>
              <time
                dateTime={dayjs(standup.publishedAt).toISOString()}
                className="shrink-0 text-2xs tabular-nums text-muted-foreground"
              >
                {standupEntryTime(standup.publishedAt)}
              </time>
            </header>
            <div className="px-4 pb-3">
              <Markdown className={standupProseClass}>{standup.content}</Markdown>
            </div>
          </article>
        </m.section>
      ) : null}
    </div>
  );
}

/** One item: the sidebar's leading mark, the title, then when it last moved. */
function TodayRow({
  item,
  awaitingAnswer,
}: {
  item: TodayItem;
  awaitingAnswer: boolean;
}) {
  const { repo } = useRepo();
  return (
    <li>
      <Link
        to={toInternalRepoHref(entityHref(item.kind, repo, item.numId))}
        // 40 high (py-2.5 + 20 line) for the minimum hit area; a ring for keyboard focus.
        className="motion-press flex items-center gap-2.5 rounded-[calc(var(--radius)-4px)] px-3 py-2.5 text-sm hover:bg-accent-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-[0.99]"
      >
        <TodayLeading item={item} awaitingAnswer={awaitingAnswer} />
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <RelativeDateTime
          at={item.at}
          className="shrink-0 text-2xs tabular-nums text-muted-foreground"
        />
      </Link>
    </li>
  );
}

/**
 * The sidebar `SessionStatusLeading` order: the "?" mark while Eva waits on
 * the user, the working grid while a turn runs, else the PR icon in its
 * state colour. Every Today item has one of the three.
 */
function TodayLeading({
  item,
  awaitingAnswer,
}: {
  item: TodayItem;
  awaitingAnswer: boolean;
}) {
  if (awaitingAnswer) {
    return (
      <span className={SESSIONS_LEADING_SLOT} title="Waiting for your answer">
        <AwaitingAnswerMark />
      </span>
    );
  }
  if (item.working) {
    return (
      <span className={SESSIONS_LEADING_SLOT} title="Working">
        <LoadingState label="Working" variant="Drive" size="sm" iconOnly />
      </span>
    );
  }
  // The review surface's one state table: merged, draft and closed each get
  // their own glyph, not only a colour.
  const draft = item.prState === "draft";
  const meta = statusMeta(
    item.prState === "draft" || item.prState === undefined
      ? "open"
      : item.prState,
    draft,
  );
  const Icon = meta.icon;
  return (
    <span className={SESSIONS_LEADING_SLOT} title={`PR: ${meta.label}`}>
      <Icon size={14} className={cn("shrink-0", meta.textClassName)} />
    </span>
  );
}
