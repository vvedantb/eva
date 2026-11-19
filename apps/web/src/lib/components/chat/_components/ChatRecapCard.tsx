import { Button, Shimmer, tokenTransition } from "@vvedantb/ui";
import { IconX } from "@tabler/icons-react";
import { m } from "motion/react";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";

/**
 * "Since you've been gone": the recap of what happened while the user was
 * away (`useChatRecap`), under the newest message. Only this user sees it.
 * Task chats in a project recap are mention chips.
 */
export function ChatRecapCard({
  text,
  repo,
  onDismiss,
}: {
  /** Undefined while the model writes it. */
  text: string | undefined;
  repo: ChatRepo;
  onDismiss: () => void;
}) {
  return (
    <m.section
      aria-label="Since you've been gone"
      className="flex flex-col gap-2 rounded-surface bg-muted p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-medium">Since you&apos;ve been gone</h3>
        <span className="text-xs text-muted-foreground">
          Visible only to you
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss recap"
          onClick={onDismiss}
        >
          <IconX className="size-3.5" />
        </Button>
      </div>
      {text === undefined ? (
        <Shimmer as="span" className="text-sm" duration={2.5} spread={1.5}>
          Catching you up…
        </Shimmer>
      ) : (
        <MarkdownMentionText
          text={text}
          repoBasePath={repo.basePath}
          repoId={repo.id}
          className="text-sm"
        />
      )}
    </m.section>
  );
}
