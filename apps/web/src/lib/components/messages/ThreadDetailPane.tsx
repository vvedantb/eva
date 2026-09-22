"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
  Skeleton,
} from "@eva/ui";
import { IconArrowUp, IconCheck } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { AveMark } from "@/lib/components/ave/AveMark";
import { catchMutationError, withMutationToast } from "@/lib/utils/mutationToast";
import {
  participantNames,
  sourceKindLabel,
  statusBadgeVariant,
  statusLabel,
} from "@/lib/components/messages/status";
import type { FunctionReturnType } from "convex/server";

type Thread = FunctionReturnType<typeof api.routedThreads.listMine>[number];

export function ThreadDetailPane({ thread }: { thread: Thread }) {
  const me = useQuery(api.auth.me);
  const messages = useQuery(api.routedThreads.listMessages, {
    threadId: thread._id,
  });
  const reply = useMutation(api.routedThreads.reply);
  const resolve = useMutation(api.routedThreads.resolve);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const canWrite =
    me !== undefined &&
    (thread.participants.some((participant) => participant.userId === me) ||
      me === thread.sourceOwnerUserId);
  const closed =
    thread.status === "resolved" || thread.status === "cancelled";

  useEffect(() => {
    setDraft("");
  }, [thread._id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thread._id]);

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
    textareaRef.current?.focus();
  };

  const sourceLabel = thread.sourceNumId
    ? `${sourceKindLabel(thread.sourceKind)} ${thread.sourceNumId}`
    : sourceKindLabel(thread.sourceKind);
  const outstanding = thread.participants.filter(
    (participant) => participant.needsReply,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-balance">
              {thread.title}
            </h2>
            <Badge
              variant={statusBadgeVariant(thread.status)}
              className="h-5 shrink-0 px-2 text-[11px] font-medium"
            >
              {statusLabel(thread.status)}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            To {participantNames(thread.participants)}
            {" · "}
            {thread.sourceHref ? (
              <a
                href={thread.sourceHref}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {sourceLabel}
                {thread.sourceTitle ? ` · ${thread.sourceTitle}` : ""}
              </a>
            ) : (
              <>
                {sourceLabel}
                {thread.sourceTitle ? ` · ${thread.sourceTitle}` : ""}
              </>
            )}
            {outstanding.length > 0
              ? ` · Waiting on ${participantNames(outstanding)}`
              : ""}
          </p>
        </div>
        {!closed && canWrite ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 text-xs"
            onClick={() =>
              void catchMutationError(
                resolve({ threadId: thread._id }),
                "Couldn't resolve",
                "routed-resolve",
              )
            }
          >
            <IconCheck size={14} />
            Resolve
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar bg-muted/40">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          <div className="rounded-surface border border-border bg-background px-5 py-5">
            {messages === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {messages.map((message) => {
                  const fromEva = message.authorKind === "eva";
                  const name = message.authorName ?? (fromEva ? "Eva" : "You");
                  return (
                    <article
                      key={message._id}
                      className="flex gap-3 py-4 first:pt-0 last:pb-0"
                    >
                      {fromEva ? (
                        <AveMark size={28} className="mt-0.5 shrink-0" />
                      ) : (
                        <Avatar className="mt-0.5 size-7 shrink-0">
                          <AvatarFallback className="text-xs font-medium">
                            {name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{name}</span>
                          <RelativeDateTime
                            at={message.createdAt}
                            className="text-xs text-muted-foreground"
                          />
                        </div>
                        {message.context ? (
                          <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-[11px] font-medium text-muted-foreground">
                              Background
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                              {message.context}
                            </p>
                          </div>
                        ) : null}
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {message.body}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      {!closed && canWrite ? (
        <div className="border-t border-border bg-background p-4">
          <InputGroup className="overflow-hidden rounded-surface">
            <InputGroupTextarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[88px] text-sm"
              placeholder="Write a reply…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <InputGroupAddon align="block-end" className="justify-between">
              <InputGroupText className="text-[11px] font-normal">
                ⌘↵ to send
              </InputGroupText>
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
            </InputGroupAddon>
          </InputGroup>
        </div>
      ) : null}
    </div>
  );
}
