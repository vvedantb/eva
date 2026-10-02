"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Avatar,
  AvatarFallback,
  CenteredSpinner,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  cn,
} from "@eva/ui";
import { IconArrowUp, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { AveMark } from "@/lib/components/ave/AveMark";
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

const DOCK_MAX_HEIGHT: Record<RoutedQuestionDockSize, string> = {
  popover: "max-h-[min(40dvh,20rem)]",
  page: "max-h-[min(60dvh,40rem)]",
};

/**
 * Questions Eva routed to the caller, docked above Manager Ave's composer.
 *
 * Docked rather than posted into Ave's conversation: Ave's thread is the user's
 * own command channel, so a free-text "go with the ghost card" there has no
 * question to attach to, and a group question copied into each person's
 * private thread would hide the other answers. Each card here replies to its
 * routed thread directly, without starting an Ave run.
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
  return <QuestionStack threads={threads} size={size} />;
}

function QuestionStack({
  threads,
  size,
}: {
  threads: RoutedThread[];
  size: RoutedQuestionDockSize;
}) {
  // `null` means the user collapsed everything. Any other id that has left
  // the list (it was answered) falls through to the next waiting question,
  // so answering one opens the one after it.
  const [openId, setOpenId] = useState<string | null>(threads[0]._id);
  const expandedId =
    openId === null
      ? null
      : threads.some((thread) => thread._id === openId)
        ? openId
        : threads[0]._id;

  return (
    <div className="mb-2 rounded-surface border border-border bg-card px-3 py-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        {threads.length === 1
          ? "Question for you"
          : `${threads.length} questions for you`}
      </div>
      <ul
        className={cn(
          "flex flex-col divide-y divide-border overflow-y-auto scrollbar",
          DOCK_MAX_HEIGHT[size],
        )}
      >
        {threads.map((thread) => (
          <QuestionCard
            key={thread._id}
            thread={thread}
            expanded={thread._id === expandedId}
            onToggle={() =>
              setOpenId(thread._id === expandedId ? null : thread._id)
            }
          />
        ))}
      </ul>
    </div>
  );
}

function QuestionCard({
  thread,
  expanded,
  onToggle,
}: {
  thread: RoutedThread;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="py-1 first:pt-0 last:pb-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60"
      >
        <AveMark size={16} className="mt-0.5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Collapsed rows truncate so the list scans; open, this line is the
              question itself, so it wraps instead of being repeated below. */}
          <span
            className={cn(
              "text-sm font-medium",
              expanded ? "text-pretty" : "truncate",
            )}
          >
            {thread.title}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">
              {sourceLabel(thread)}
              {thread.sourceTitle ? ` · ${thread.sourceTitle}` : ""}
            </span>
            <span aria-hidden>·</span>
            <RelativeDateTime at={thread.createdAt} className="shrink-0" />
          </span>
        </span>
        <IconChevronDown
          size={14}
          className={cn(
            "mt-1 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? <QuestionBody thread={thread} /> : null}
    </li>
  );
}

/**
 * Who else is on a group question, in one line: "Priya replied",
 * "Also asked Sam", or "Priya replied · waiting on Sam". `null` for a
 * question asked of the viewer alone.
 */
function teammatesSummary(
  teammates: readonly { name: string; needsReply: boolean }[],
): string | null {
  const replied = teammates.filter((person) => !person.needsReply);
  const pending = teammates.filter((person) => person.needsReply);
  const parts: string[] = [];
  if (replied.length > 0) parts.push(`${participantNames(replied)} replied`);
  if (pending.length > 0) {
    parts.push(
      `${replied.length > 0 ? "waiting on" : "Also asked"} ${participantNames(pending)}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function QuestionBody({ thread }: { thread: RoutedThread }) {
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

  // The others on a group question, so a reply is not written blind.
  const teammates =
    me === undefined
      ? []
      : thread.participants.filter((participant) => participant.userId !== me);
  const summary = teammatesSummary(teammates);

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

  return (
    <div className="flex flex-col gap-2.5 pb-1.5 pl-[1.875rem] pr-1.5 pt-0.5">
      {summary ? (
        <p className="text-[11px] text-muted-foreground">{summary}</p>
      ) : null}
      {messages === undefined ? (
        <CenteredSpinner label="Loading question" />
      ) : (
        messages.map((message) => {
          if (message.authorKind === "eva") {
            // The header already shows the question; only a follow-up ask on
            // the same topic says something new.
            const isRepeat = message.body.trim() === thread.title;
            return (
              <div key={message._id} className="flex flex-col gap-2">
                {message.context ? (
                  <QuestionBackground context={message.context} />
                ) : null}
                {isRepeat ? null : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.body}
                  </p>
                )}
              </div>
            );
          }
          const name = message.authorName ?? "Teammate";
          return (
            <article key={message._id} className="flex gap-2">
              <Avatar className="mt-0.5 size-5 shrink-0">
                <AvatarFallback className="text-[10px] font-medium">
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium">{name}</span>
                  <RelativeDateTime
                    at={message.createdAt}
                    className="text-[11px] text-muted-foreground"
                  />
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                  {message.body}
                </p>
              </div>
            </article>
          );
        })
      )}
      <InputGroup className="overflow-hidden rounded-surface">
        <InputGroupTextarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[56px] text-sm"
          placeholder="Reply to Eva…"
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
        <InputGroupAddon align="block-end" className="justify-end">
          <span className="flex items-center gap-1">
            <InputGroupButton
              variant="ghost"
              size="sm"
              aria-label="Resolve without replying"
              onClick={() =>
                void catchMutationError(
                  resolve({ threadId: thread._id }),
                  "Couldn't resolve",
                  "routed-resolve",
                )
              }
            >
              <IconCheck />
              Resolve
            </InputGroupButton>
            <InputGroupButton
              variant="default"
              size="sm"
              disabled={sending || draft.trim().length === 0}
              aria-label="Send reply"
              onClick={() => void handleSend()}
            >
              Send
              <IconArrowUp />
            </InputGroupButton>
          </span>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

/**
 * Clamped to three lines by default: the popover is small, and an unclamped
 * briefing pushes the reply box out of view before the question is read.
 */
function QuestionBackground({ context }: { context: string }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="rounded-lg bg-muted/60 px-2.5 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">
        Background
      </p>
      <p
        className={cn(
          "mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground",
          !showAll && "line-clamp-3",
        )}
      >
        {context}
      </p>
      <button
        type="button"
        onClick={() => setShowAll(!showAll)}
        className="mt-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {showAll ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
