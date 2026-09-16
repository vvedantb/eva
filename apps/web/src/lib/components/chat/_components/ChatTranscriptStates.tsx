import { Button, ConversationEmptyState, Skeleton } from "@eva/ui";

/**
 * What a chat shows instead of turns: the empty state, and the placeholder for
 * a transcript that has not arrived yet. Both live here so the two cases cannot
 * drift apart — telling a user "no messages yet" while the query is still in
 * flight is a lie the eye catches every time a task chat opens.
 */

/**
 * Stand-in for a transcript still loading. Convex returns `undefined` until the
 * first page lands, and the panels collapse that into `[]` — without this the
 * empty state flashes on every open of a chat that has plenty of messages.
 */
export function ChatTranscriptSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading conversation"
      className="flex w-full flex-col gap-3 py-2"
    >
      {/* Shaped like the transcript it stands in for: a short user bubble on
          the right, then two assistant lines. */}
      <Skeleton className="h-8 w-2/5 self-end rounded-surface" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

/**
 * The empty transcript. `description` is always explicit — the library's own
 * default ("Start a conversation to see messages here") contradicts the asleep
 * state, where starting a conversation is exactly what the user cannot do yet.
 *
 * With an `action`, the block is composed here rather than through
 * title/description props: the library renders `children` in place of its
 * default block, which is the one slot a button can sit in under the title.
 */
export function ChatEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  if (!action) {
    return <ConversationEmptyState title={title} description={description} />;
  }
  return (
    <ConversationEmptyState>
      <div className="space-y-1">
        <h3 className="font-medium text-sm">{title}</h3>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      <Button size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    </ConversationEmptyState>
  );
}
