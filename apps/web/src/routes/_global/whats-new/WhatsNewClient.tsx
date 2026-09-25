"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import {
  CenteredSpinner,
  cn,
  STREAMDOWN_TABLE_RADIUS_CLASS,
  motionBase,
  motionStagger,
} from "@eva/ui";
import { m } from "motion/react";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { IconSparkles } from "@tabler/icons-react";
import dayjs from "dayjs";
import { PageWrapper } from "@/lib/components/PageWrapper";
import { EmptyState } from "@/lib/components/ui/EmptyState";

/** Same plugin set as `ChangelogDialog`, so both surfaces render identically. */
const whatsNewPlugins = { cjk, math, mermaid };

/**
 * Every published entry of the "Eva Weekly Changelog" automation as a timeline.
 * The dialog shows only the newest one; this is the full archive.
 */
export function WhatsNewClient() {
  const entries = useQuery(api.changelog.listChangelog);

  return (
    <PageWrapper title="What's New" comfortable>
      {entries === undefined ? (
        <CenteredSpinner label="Loading updates" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<IconSparkles size={24} />}
          title="Nothing new yet"
          description="Published weekly updates will show up here."
        />
      ) : (
        // The rail is drawn on the list, not per entry, so it runs unbroken
        // between cards instead of restarting at each one.
        <ol className="relative space-y-4 border-l border-border pl-6 sm:pl-8">
          {entries.map((entry, index) => (
            <m.li
              key={entry.id}
              className="relative"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...motionBase, delay: motionStagger(index) }}
            >
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
                    Week of {dayjs(entry.publishedAt).format("MMM D, YYYY")}
                  </h2>
                  {index === 0 ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Latest
                    </span>
                  ) : null}
                </header>
                <div className="px-4 py-3">
                  <Streamdown
                    className={cn(
                      "text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                      STREAMDOWN_TABLE_RADIUS_CLASS,
                    )}
                    plugins={whatsNewPlugins}
                  >
                    {entry.content}
                  </Streamdown>
                </div>
              </article>
            </m.li>
          ))}
        </ol>
      )}
    </PageWrapper>
  );
}
