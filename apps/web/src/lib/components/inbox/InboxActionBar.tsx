"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button } from "@vvedantb/ui";
import { IconArrowBackUp, IconArrowUpRight, IconCheck } from "@tabler/icons-react";
import { Kbd } from "@/lib/components/ui/Kbd";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { InboxRow } from "@/lib/components/inbox/useInboxDone";

/**
 * The bar under the Inbox pane: the row's one action (Answer, Review PR,
 * Retry), Reply for a chat, Open as a full page, and Done. The keys
 * (Q, R, Enter, E) do the same from the list.
 */
export function InboxActionBar({
  row,
  onAnswer,
  onReply,
  onOpen,
  onDone,
}: {
  row: InboxRow;
  onAnswer: () => void;
  onReply: () => void;
  onOpen: () => void;
  /** Undefined when Done cannot act on the row: it leaves once someone acts on it. */
  onDone: (() => void) | undefined;
}) {
  const retry = useMutation(api.agentTasks.startExecution);
  const { taskId, prUrl } = row;
  const buttonClass = "h-7 gap-1.5 text-xs";
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
      {row.action === "answer" ? (
        <Button size="sm" className={buttonClass} onClick={onAnswer}>
          Answer
          <Kbd hotkey="Q" />
        </Button>
      ) : null}
      {row.action === "review" && prUrl ? (
        <Button size="sm" className={buttonClass} asChild>
          <a href={prUrl} target="_blank" rel="noreferrer">
            Review PR
          </a>
        </Button>
      ) : null}
      {row.action === "retry" && taskId ? (
        <Button
          size="sm"
          className={buttonClass}
          onClick={() =>
            void catchMutationError(
              retry({ id: taskId }),
              "Couldn't retry the task",
              "inbox-retry",
            )
          }
        >
          Retry
        </Button>
      ) : null}
      {row.kind === "chat" ? (
        <Button size="sm" variant="outline" className={buttonClass} onClick={onReply}>
          <IconArrowBackUp size={14} />
          Reply
          <Kbd hotkey="R" />
        </Button>
      ) : null}
      <span className="flex-1" />
      <Button size="sm" variant="ghost" className={buttonClass} onClick={onOpen}>
        Open
        <IconArrowUpRight size={14} />
      </Button>
      {onDone ? (
        <Button size="sm" variant="outline" className={buttonClass} onClick={onDone}>
          <IconCheck size={14} />
          Done
          <Kbd hotkey="E" />
        </Button>
      ) : null}
    </div>
  );
}
