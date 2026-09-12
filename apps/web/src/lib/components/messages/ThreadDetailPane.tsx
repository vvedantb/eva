"use client";

import { useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, Textarea, Skeleton } from "@eva/ui";
import { IconCheck } from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { catchMutationError, withMutationToast } from "@/lib/utils/mutationToast";
import { statusClass, statusLabel } from "@/lib/components/messages/status";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canWrite =
    me !== undefined &&
    (me === thread.assigneeUserId || me === thread.sourceOwnerUserId);
  const closed =
    thread.status === "resolved" || thread.status === "cancelled";

  const handleSend = async () => {
    const body = textareaRef.current?.value.trim() ?? "";
    if (!body || sending) return;
    setSending(true);
    try {
      await withMutationToast(
        reply({ threadId: thread._id, body }),
        "Reply sent",
        "Couldn't send reply",
        "routed-reply",
      );
      if (textareaRef.current) textareaRef.current.value = "";
    } catch {
      // Toast already shown.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{thread.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            To {thread.assigneeName}
            {thread.sourceHref ? (
              <>
                {" · "}
                <a
                  href={thread.sourceHref}
                  className="underline-offset-2 hover:underline"
                >
                  {thread.sourceTitle}
                </a>
              </>
            ) : (
              <> · {thread.sourceTitle}</>
            )}
          </p>
          <p className={`mt-1 text-[10px] font-medium uppercase ${statusClass(thread.status)}`}>
            {statusLabel(thread.status)}
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

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar px-4 py-3">
        {messages === undefined ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div key={message._id} className="rounded-surface bg-muted/40 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">
                    {message.authorName ?? "Eva"}
                  </span>
                  <RelativeDateTime
                    at={message.createdAt}
                    className="text-[11px]"
                  />
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                  {message.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {!closed && canWrite ? (
        <div className="border-t border-border p-3">
          <Textarea
            ref={textareaRef}
            className="min-h-[88px] text-sm"
            placeholder="Reply to Eva…"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" disabled={sending} onClick={() => void handleSend()}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
