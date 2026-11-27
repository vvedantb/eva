"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { IconMessages } from "@tabler/icons-react";
import { Button, ConversationEmptyState } from "@vvedantb/ui";
import type { FunctionReturnType } from "convex/server";
import { api } from "@eva/backend";
import { ThreadSummary } from "@/lib/components/chat/replies/ThreadSummary";
import type { ChatParentId } from "@/lib/components/chat/chatBodyUtils";

/**
 * The Replies tab with no thread open: the chat's messages that have replies,
 * latest first. A row opens its thread.
 */
export function ReplyThreadList({
  chatParentId,
  onOpen,
}: {
  chatParentId: ChatParentId;
  onOpen: (rootId: string) => void;
}) {
  const threads = useQuery(api.messages.listThreadSummaries, {
    parentId: chatParentId,
  });
  return threads ? <ReplyThreadRows threads={threads} onOpen={onOpen} /> : null;
}

/** The list itself, apart from its query so a demo page can feed it rows. */
export function ReplyThreadRows({
  threads,
  onOpen,
}: {
  threads: FunctionReturnType<typeof api.messages.listThreadSummaries>;
  onOpen: (rootId: string) => void;
}) {
  if (threads.length === 0) {
    return (
      <ConversationEmptyState
        icon={<IconMessages className="size-10 text-muted-foreground/60" />}
        title="No replies yet."
        description=""
      />
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
      {threads.map((thread) => (
        <li key={thread.rootId} className="rounded-control p-2 hover:bg-accent-soft">
          <Button
            variant="ghost"
            className="h-auto w-full justify-start whitespace-normal p-0 text-left text-sm font-normal hover:bg-transparent"
            onClick={() => onOpen(thread.rootId)}
          >
            <span className="line-clamp-2">{thread.preview}</span>
          </Button>
          <div className="mt-1">
            <ThreadSummary
              rootId={thread.rootId}
              replyCount={thread.replyCount}
              replierIds={thread.replierIds}
              onOpen={() => onOpen(thread.rootId)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
