"use client";

import { useState } from "react";
import { useQueryState } from "nuqs";
import { cn } from "@eva/ui";
import { IconDownload, IconPlus } from "@tabler/icons-react";
import {
  CHAT_LOG_KIND_LABELS,
  chatLogDay,
  currentDecisions,
  renderChatLogMarkdown,
} from "@eva/shared/chatLog";
import {
  SessionSourceDetail,
  SessionSourceEmpty,
  sessionSourceDetailTitleClass,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";
import { chatLogKindParser, chatLogKinds } from "@/lib/search-params";
import { downloadMarkdownFile } from "@/lib/utils/downloadMarkdownFile";
import { AddLogEntryDialog } from "./AddLogEntryDialog";
import { ChatLogEntryCard } from "./ChatLogEntryCard";
import { ChatLogIcon } from "./ChatLogIcon";
import type { ChatLogEntry } from "./useChatLog";

type LogItem = { entry: ChatLogEntry; history: ChatLogEntry[] };

/**
 * Entries nothing has replaced, each with the older versions it replaced
 * (newest first), so the timeline shows one row per finding or decision.
 */
function currentWithHistory(entries: ChatLogEntry[]): LogItem[] {
  const byId = new Map(entries.map((entry) => [entry._id, entry]));
  const olderThan = (entry: ChatLogEntry) =>
    entry.supersedesId ? byId.get(entry.supersedesId) : undefined;
  return entries
    .filter((entry) => entry.supersededById === undefined)
    .map((entry) => {
      const history: ChatLogEntry[] = [];
      // Bounded by the entry count, so a malformed chain cannot loop.
      for (
        let older = olderThan(entry);
        older && history.length < entries.length;
        older = olderThan(older)
      ) {
        history.push(older);
      }
      return { entry, history };
    });
}

/** Items grouped by day, newest day first; items within a day oldest first. */
function groupByDay(items: LogItem[]) {
  const days: Array<{ day: string; items: LogItem[] }> = [];
  for (const item of items) {
    const day = chatLogDay(item.entry.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days.reverse();
}

/**
 * The chat Log, opened from the pinned row of the Documents tab: current
 * decisions on top, then the current version of each entry by day, titles
 * first. Read-only except Add.
 */
export function ChatLogView({
  source,
  entries,
  onBack,
}: {
  source: ChatSourceArg;
  entries: ChatLogEntry[];
  onBack: () => void;
}) {
  const [kindFilter, setKindFilter] = useQueryState(
    "logKind",
    chatLogKindParser,
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const decisions = currentDecisions(entries);
  const visible = currentWithHistory(entries).filter(
    (item) => kindFilter === null || item.entry.kind === kindFilter,
  );

  const download = () =>
    downloadMarkdownFile(
      `${source.kind}-log.md`,
      renderChatLogMarkdown(entries),
    );

  return (
    <SessionSourceDetail
      backLabel="Documents"
      onBack={onBack}
      title={<p className={sessionSourceDetailTitleClass}>Log</p>}
      actions={
        <>
          <button
            type="button"
            className={sessionSourceViewAllClass}
            onClick={() => setIsAddOpen(true)}
          >
            <IconPlus size={14} />
            Add
          </button>
          <button
            type="button"
            className={sessionSourceViewAllClass}
            onClick={download}
            disabled={entries.length === 0}
            aria-label="Download log as markdown"
            title="Download as markdown"
          >
            <IconDownload size={14} />
          </button>
        </>
      }
    >
      <div className="scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto bg-muted/40">
        {entries.length === 0 ? (
          <SessionSourceEmpty
            icon={<ChatLogIcon size={20} />}
            title="Nothing logged yet"
            description="The agent logs decisions, research and changes as it works. Answered questions and commits are logged too."
          />
        ) : (
          <div className="flex flex-col gap-4 p-3">
            {decisions.length > 0 ? (
              <section aria-label="Current decisions" className="space-y-1.5">
                <h3 className="px-1 text-xs font-medium text-muted-foreground">
                  Current decisions
                </h3>
                <ul className="space-y-1 rounded-surface bg-card p-3 text-2sm text-foreground">
                  {decisions.map((entry) => (
                    <li key={entry._id} className="text-pretty">
                      {entry.title}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <div
              className="flex flex-wrap gap-1"
              role="radiogroup"
              aria-label="Filter by kind"
            >
              {[null, ...chatLogKinds].map((kind) => (
                <button
                  key={kind ?? "all"}
                  type="button"
                  role="radio"
                  aria-checked={kindFilter === kind}
                  onClick={() => void setKindFilter(kind)}
                  className={cn(
                    "motion-press rounded-md px-2 py-0.5 text-xs active:scale-[0.96]",
                    kindFilter === kind
                      ? "bg-card font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {kind === null ? "All" : CHAT_LOG_KIND_LABELS[kind]}
                </button>
              ))}
            </div>
            {groupByDay(visible).map((group) => (
              <section key={group.day} className="space-y-1.5">
                <h3 className="px-1 text-xs font-medium text-muted-foreground">
                  {group.day}
                </h3>
                {group.items.map(({ entry, history }) => (
                  <ChatLogEntryCard
                    key={entry._id}
                    entry={entry}
                    history={history}
                  />
                ))}
              </section>
            ))}
            {visible.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">
                No entries of this kind.
              </p>
            ) : null}
          </div>
        )}
      </div>
      <AddLogEntryDialog
        source={source}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
      />
    </SessionSourceDetail>
  );
}
