import { Button, CenteredSpinner, ConversationEmptyState } from "@vvedantb/ui";

/**
 * Stand-in for a transcript still loading. Convex returns `undefined` until the
 * first page lands, and the panels collapse that into `[]` — without this the
 * empty state flashes on every open of a chat that has plenty of messages.
 */
export function ChatTranscriptLoading() {
  return <CenteredSpinner label="Loading conversation" />;
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
