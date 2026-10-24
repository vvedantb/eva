"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { cn } from "@eva/ui";
import {
  CenteredSpinner,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@vvedantb/ui";
import {
  IconArrowUp,
  IconArrowUpRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconInfoCircle,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { participantNames, sourceLabel } from "@/lib/components/routed/status";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type RoutedThread = FunctionReturnType<
  typeof api.routedThreads.listWaitingForMe
>[number];

/** Where the dock is mounted; the full-screen page has room for a taller one. */
export type RoutedQuestionDockSize = "popover" | "page";

/** Caps the question and its replies; the header and reply box stay in view. */
const BODY_MAX_HEIGHT: Record<RoutedQuestionDockSize, string> = {
  popover: "max-h-[min(30dvh,15rem)]",
  page: "max-h-[min(50dvh,32rem)]",
};

const PAGER_BUTTON_CLASS =
  "flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

/**
 * Questions Eva routed to the caller, docked above Manager Ave's composer.
 *
 * Docked rather than posted into Ave's conversation: Ave's thread is the user's
 * own command channel, so a free-text "go with the ghost card" there has no
 * question to attach to, and a group question copied into each person's
 * private thread would hide the other answers. Each card replies to its routed
 * thread directly, without starting an Ave run.
 *
 * Unlike AskUserQuestion's dock it sits above the composer instead of
 * replacing it — the user can still talk to Ave while questions are waiting.
 */
export function RoutedQuestionDock({
  size = "popover",
}: {
  size?: RoutedQuestionDockSize;
}) {
  const threads = useQuery(api.routedThreads.listWaitingForMe, {});
  if (!threads || threads.length === 0) return null;
  return <QuestionPager threads={threads} size={size} />;
}

/**
 * One question at a time. A list of expandable rows made the popover a stack
 * of half-visible cards; paging keeps the open question whole and the reply
 * box always in the same place.
 */
function QuestionPager({
  threads,
  size,
}: {
  threads: RoutedThread[];
  size: RoutedQuestionDockSize;
}) {
  const [currentId, setCurrentId] = useState<string>(threads[0]._id);
  // An answered question leaves the list; land on the one that took its slot
  // rather than jumping back to the first.
  const [lastIndex, setLastIndex] = useState(0);
  const foundIndex = threads.findIndex((thread) => thread._id === currentId);
  const index =
    foundIndex >= 0 ? foundIndex : Math.min(lastIndex, threads.length - 1);
  if (index !== lastIndex) setLastIndex(index);
  const thread = threads[index];

  const go = (next: number) => setCurrentId(threads[next]._id);

  return (
    <div className="mb-2 rounded-surface border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          Question for you · {sourceLabel(thread)}
          {thread.sourceTitle ? ` · ${thread.sourceTitle}` : ""}
        </p>
        {threads.length > 1 ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {index + 1} of {threads.length}
            </span>
            <button
              type="button"
              aria-label="Previous question"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className={PAGER_BUTTON_CLASS}
            >
              <IconChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next question"
              disabled={index === threads.length - 1}
              onClick={() => go(index + 1)}
              className={PAGER_BUTTON_CLASS}
            >
              <IconChevronRight size={14} />
            </button>
          </div>
        ) : null}
      </div>
      {/* Keyed so the draft and the open "why" panel belong to one question. */}
      <QuestionCard key={thread._id} thread={thread} size={size} />
    </div>
  );
}

/** Teammate chips: "Priya replied" in the success tone, "Waiting on Sam" muted. */
function TeammateChips({
  teammates,
}: {
  teammates: readonly { userId: string; name: string; needsReply: boolean }[];
}) {
  const replied = teammates.filter((person) => !person.needsReply);
  const pending = teammates.filter((person) => person.needsReply);
  if (teammates.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {replied.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-success">
          <IconCheck size={12} />
          {participantNames(replied)} replied
        </span>
      ) : null}
      {pending.length > 0 ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {replied.length > 0 ? "Waiting on" : "Also asked"}{" "}
          {participantNames(pending)}
        </span>
      ) : null}
    </div>
  );
}

function QuestionCard({
  thread,
  size,
}: {
  thread: RoutedThread;
  size: RoutedQuestionDockSize;
}) {
  const messages = useQuery(api.routedThreads.listMessages, {
    threadId: thread._id,
  });
  const me = useQuery(api.auth.me);
  const reply = useMutation(api.routedThreads.reply);
  const resolve = useMutation(api.routedThreads.resolve);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // As in `MentionTextarea`: a phone's Return key inserts a newline, while a
  // physical Enter key sends.
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");

  const teammates =
    me === undefined
      ? []
      : thread.participants.filter((participant) => participant.userId !== me);
  // The first Eva message carries the briefing; its body is the title.
  const briefing = messages?.find((message) => message.authorKind === "eva");
  const replies = messages?.filter((message) => message !== briefing) ?? [];

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await withMutationToast(
        reply({ threadId: thread._id, body }),
        "Reply sent",
        "Couldn't send reply",
        "routed-reply",
      );
      setDraft("");
    } catch {
      // Toast already shown.
    }
    // No `finally`: the catch swallows, so this always runs (and `finally`
    // bails the React Compiler out of the whole file).
    setSending(false);
  };

  const canSend = !sending && draft.trim().length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={cn(
          "flex flex-col gap-2.5 overflow-y-auto scrollbar",
          BODY_MAX_HEIGHT[size],
        )}
      >
        <h3 className="text-[15px] font-semibold leading-snug text-pretty">
          {thread.title}
        </h3>
        {briefing?.context ? (
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <IconInfoCircle size={13} />
              Why Eva is asking
              <IconChevronRight
                size={12}
                className="transition-transform group-data-[state=open]:rotate-90"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
                {briefing.context}
              </p>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        <TeammateChips teammates={teammates} />
        {messages === undefined ? (
          <CenteredSpinner label="Loading question" />
        ) : (
          replies.map((message) => (
            <div key={message._id} className="border-l-2 border-border pl-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium">
                  {message.authorKind === "eva"
                    ? "Eva"
                    : (message.authorName ?? "Teammate")}
                </span>
                <RelativeDateTime
                  at={message.createdAt}
                  className="text-[11px] text-muted-foreground"
                />
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.body}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="flex items-end gap-2 rounded-3xl border border-border bg-background py-1.5 pl-3.5 pr-1.5 focus-within:ring-2 focus-within:ring-ring/30">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={1}
          aria-label="Your answer"
          placeholder="Your answer…"
          className="max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground"
          // Same keys as the chat composer: Enter sends, Shift+Enter breaks
          // the line. An IME confirming a word also fires Enter; leave it be.
          onKeyDown={(event) => {
            if (
              !isCoarsePointer &&
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          aria-label="Send answer"
          disabled={!canSend}
          onClick={() => void handleSend()}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <IconArrowUp size={16} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() =>
            void catchMutationError(
              resolve({ threadId: thread._id }),
              "Couldn't resolve",
              "routed-resolve",
            )
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Resolve without answering
        </button>
        {thread.sourceHref ? (
          <a
            href={thread.sourceHref}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Open {sourceLabel(thread)}
            <IconArrowUpRight size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
