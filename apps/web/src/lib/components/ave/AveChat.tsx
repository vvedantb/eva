"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";
import { useAveChat } from "@/lib/components/ave/useAveChat";

/**
 * Manager Ave's chat. Shared by the launcher popover and the `/ave` page.
 *
 * Ave runs on the server on a fixed model with no codebase of its own, so the
 * chat has no repo (no skills, stash or repo mentions), no model picker, no
 * render_ui panels. A message sent mid-run is folded into the next run by
 * the server; until then it sits read-only in the queue panel, as in sessions.
 */
export function AveChat() {
  return (
    <QueryErrorBoundary
      fallback={(retry) => (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <IconAlertTriangle className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Manager Ave could not load</p>
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
    >
      <AveChatBody />
    </QueryErrorBoundary>
  );
}

function AveChatBody() {
  const chat = useAveChat();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatBody
        conversationId={chat.conversationId}
        messages={chat.messages}
        isLoadingMessages={chat.isLoadingMessages}
        queuedMessages={[]}
        heldFollowUps={chat.followUps}
        streamingActivity={chat.streamingActivity}
        streamingContent={chat.streamingContent}
        isExecuting={chat.isExecuting}
        isInputDisabled={false}
        placeholder="Ask Manager Ave to start or check on agents..."
        emptyStateTitle="What should your agents work on?"
        emptyStateDescription="Manager Ave starts sessions and quick tasks across your codebases, then reports back here."
        onSend={chat.send}
        onCancel={chat.cancel}
        localDraft={chat.localDraft}
        hideJumpRail
      />
    </div>
  );
}
