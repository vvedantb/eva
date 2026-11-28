import { Button, Shimmer, tokenTransition } from "@vvedantb/ui";
import { IconX } from "@tabler/icons-react";
import { m } from "motion/react";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";
import { recapTitle } from "@eva/shared/chatReadState";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { ThumbsRating } from "@/lib/components/chat/feedback/ThumbsRating";

const RATING_LABELS = { positive: "Helpful recap", negative: "Unhelpful recap" };

/**
 * The user's recap of this chat (`useChatRecap`), under the newest message:
 * "Since you've been gone" after an absence, "Recap" from Recap chat. Only
 * this user sees it. Task chats in a project recap are mention chips.
 */
export function ChatRecapCard({
  kind,
  since,
  text,
  rating,
  onRate,
  repo,
  onDismiss,
}: {
  kind: "away" | "full";
  since: number;
  text: string | undefined;
  rating: { sentiment: FeedbackSentiment; comment: string | undefined } | undefined;
  onRate: (sentiment: FeedbackSentiment | null, comment?: string) => Promise<unknown>;
  repo: ChatRepo;
  onDismiss: () => void;
}) {
  const title = recapTitle(kind, since);
  return (
    <m.section
      aria-label={title}
      className="flex flex-col gap-2 rounded-surface bg-muted p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">
          Visible only to you
        </span>
        {text === undefined ? null : (
          <ThumbsRating
            onRate={onRate}
            sentiment={rating?.sentiment}
            comment={rating?.comment}
            labels={RATING_LABELS}
          />
        )}
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
