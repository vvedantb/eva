"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { QueryErrorBoundary } from "@/lib/components/QueryErrorBoundary";
import { useAveChat } from "@/lib/components/ave/useAveChat";
import {
  RoutedQuestionDock,
  type RoutedQuestionDockSize,
} from "@/lib/components/routed/RoutedQuestionDock";

/**
 * Manager Ave's chat. Shared by the launcher popover and the `/ave` page.
 *
 * Ave runs on the server on a fixed model with no codebase of its own, so the
 * chat has no repo (no skills, stash or repo mentions), no model picker, no
 * render_ui panels and no queue: a message sent mid-run is folded into the
 * next run by the server. Questions Eva routed to the user dock above the
 * composer (`RoutedQuestionDock`).
 */
export function AveChat({
  size = "popover",
}: {
  /** The full-screen `/ave` page has room for a taller question dock. */
  size?: RoutedQuestionDockSize;
}) {
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
      <AveChatBody size={size} />
    </QueryErrorBoundary>
  );
}

function AveChatBody({ size }: { size: RoutedQuestionDockSize }) {
  const chat = useAveChat();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatBody
        conversationId={chat.conversationId}
        messages={chat.messages}
        isLoadingMessages={chat.isLoadingMessages}
        queuedMessages={[]}
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
        preInputContent={
          <QueryErrorBoundary>
            <RoutedQuestionDock size={size} />
          </QueryErrorBoundary>
        }
      />
    </div>
  );
}
