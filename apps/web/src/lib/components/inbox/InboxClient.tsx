"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { IconInbox } from "@tabler/icons-react";
import {
  inboxChatRefFromHref,
  inboxDoneTarget,
  inboxHistoryRow,
} from "@eva/shared/inbox";
import { isInternalAppHref } from "@eva/shared/safeUrl";
import { usePageTitleSync } from "@/lib/contexts/PageTitleContext";
import { inboxHistoryParser, inboxSelectedParser } from "@/lib/search-params";
import { PageHeader } from "@/lib/components/PageHeader";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { InboxList } from "@/lib/components/inbox/InboxList";
import { InboxActionBar } from "@/lib/components/inbox/InboxActionBar";
import {
  focusInboxFrame,
  InboxPagePreview,
} from "@/lib/components/inbox/InboxPagePreview";
import {
  useInboxDone,
  type InboxRow,
} from "@/lib/components/inbox/useInboxDone";
import { hrefToNavigateOptions } from "@/lib/utils/repoUrl";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

/**
 * The Inbox: one list grouped by how urgent it is (`inbox.list`), one row for
 * each chat, and the selected row's chat beside it (an embedded, chat-only
 * page) with a bar to act on it. Keys: ↑ ↓ move, Enter opens the full page,
 * R replies, Q answers the open question, E is Done, Escape clears the
 * selection. A repo's inbox (`repoId`) lists that repo only.
 */
export function InboxClient({
  repoId,
}: {
  repoId?: Id<"githubRepos">;
} = {}) {
  const navigate = useNavigate();
  usePageTitleSync("Inbox");
  const listArgs = repoId === undefined ? {} : { repoId };
  const [history, setHistory] = useQueryState("history", inboxHistoryParser);
  const inboxRows = useQuery(api.inbox.list, history ? "skip" : listArgs);
  const feed = useQuery(api.notifications.list, history ? { history: true } : "skip");
  // History: the whole feed, in the Inbox's rows (a repo's inbox keeps to that repo).
  const rows: InboxRow[] | undefined = history
    ? feed
        ?.filter((n) => repoId === undefined || n.repoId === repoId)
        .map(inboxHistoryRow)
    : inboxRows;
  const repos = useQuery(api.githubRepos.list, {});
  const repoById = new Map<Id<"githubRepos">, RepoWithLogo>(
    (repos ?? []).map((repo) => [repo._id, repo]),
  );
  const [selectedKey, setSelectedKey] = useQueryState("item", inboxSelectedParser);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const markDone = useInboxDone(listArgs);

  // The first row is selected until the user picks one (or the picked one leaves).
  const selected =
    rows?.find((row) => row.key === selectedKey) ?? rows?.[0];

  const select = (row: InboxRow | undefined) => setSelectedKey(row?.key ?? null);

  const open = (row: InboxRow) => {
    if (row.href && isInternalAppHref(row.href)) {
      navigate(hrefToNavigateOptions(row.href));
    }
  };

  /** Done, then the next row (or the one before, at the end) is selected. */
  const done = (row: InboxRow) => {
    if (!inboxDoneTarget(row) || !rows) return;
    const index = rows.findIndex((r) => r.key === row.key);
    const next = rows[index + 1] ?? rows[index - 1];
    markDone(row);
    if (row.key === selected?.key) select(next);
  };

  const runCommand = (command: InboxKeyCommand, list: InboxRow[]) => {
    const index = selected ? list.findIndex((r) => r.key === selected.key) : -1;
    if (command === "next" || command === "previous") {
      const step = command === "next" ? 1 : -1;
      select(list[Math.min(Math.max(index + step, 0), list.length - 1)]);
    } else if (command === "clear") {
      setSelectedKey(null);
    } else if (selected) {
      if (command === "open") open(selected);
      else if (command === "done") done(selected);
      else if (command === "reply" && selected.kind === "chat") {
        focusInboxFrame(frameRef.current, "composer");
      } else if (command === "answer" && selected.action === "answer") {
        focusInboxFrame(frameRef.current, "question");
      }
    }
  };

  /* eslint-disable no-effect/no-event-handler --
     Page-wide keys: the list, the pane and the bar all answer to them, and
     no single element holds focus while the user moves through the rows. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const command = inboxKeyCommand(e);
      if (!command || !rows || rows.length === 0) return;
      e.preventDefault();
      runCommand(command, rows);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  /* eslint-enable no-effect/no-event-handler */

  return (
    <div className="flex-1 h-full min-h-0 overflow-hidden animate-in fade-in duration-300">
      <ResizablePanelLayout
        storageKey="inbox-split"
        leftDefaultSize="36%"
        leftMinWidthPx={300}
        rightMinWidthPx={360}
        // The chat beside the list is the point of this view, so it starts open.
        defaultRightCollapsed={false}
        mobilePaneLabels={{ left: "Inbox", right: "Chat" }}
        leftPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <PageHeader title="Inbox" />
            <InboxList
              rows={rows}
              history={history}
              repoById={repoById}
              selectedKey={selected?.key ?? null}
              onSelect={select}
              onHistoryChange={(next) => {
                setSelectedKey(null);
                void setHistory(next ? true : null);
              }}
            />
          </div>
        )}
        rightPanel={() => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            {selected?.href && isInternalAppHref(selected.href) ? (
              <InboxPagePreview
                href={selected.href}
                chatOnly={inboxShowsChatOnly(selected)}
                frameRef={frameRef}
              />
            ) : selected ? (
              // No page to show (a notification without a link): its own text.
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
                <div className="mx-auto w-full max-w-2xl space-y-2 px-6 py-6">
                  <h2 className="text-lg font-semibold tracking-[-0.01em] text-balance text-foreground">
                    {selected.title}
                  </h2>
                  {selected.preview ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {selected.preview}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
                <IconInbox className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nothing new since you looked</p>
              </div>
            )}
            {selected ? (
              <InboxActionBar
                row={selected}
                onAnswer={() => focusInboxFrame(frameRef.current, "question")}
                onReply={() => focusInboxFrame(frameRef.current, "composer")}
                onOpen={
                  selected.href && isInternalAppHref(selected.href)
                    ? () => open(selected)
                    : undefined
                }
                onDone={inboxDoneTarget(selected) ? () => done(selected) : undefined}
              />
            ) : null}
          </div>
        )}
      />
    </div>
  );
}

/**
 * The pane shows the chat alone for a chat row, or a notification whose link
 * is a task, session or project chat. A reply thread opens the whole page,
 * where its Replies tab sits beside the chat.
 */
function inboxShowsChatOnly(row: InboxRow): boolean {
  if (row.threadRootId !== undefined || row.href?.includes("thread=")) return false;
  return row.kind === "chat" || (row.href !== undefined && inboxChatRefFromHref(row.href) !== undefined);
}

type InboxKeyCommand =
  | "next"
  | "previous"
  | "open"
  | "reply"
  | "answer"
  | "done"
  | "clear";

const INBOX_KEYS: Record<string, InboxKeyCommand> = {
  ArrowDown: "next",
  ArrowUp: "previous",
  Enter: "open",
  r: "reply",
  q: "answer",
  e: "done",
  Escape: "clear",
};

/** The Inbox command a key press asks for; none while typing or with a modifier. */
function inboxKeyCommand(e: KeyboardEvent): InboxKeyCommand | undefined {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return undefined;
  const target = e.target;
  if (target instanceof HTMLElement) {
    if (target.isContentEditable) return undefined;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return undefined;
    // A focused button (a row, a bar button) answers Enter itself.
    if (e.key === "Enter" && target.tagName === "BUTTON") return undefined;
  }
  return INBOX_KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
}
