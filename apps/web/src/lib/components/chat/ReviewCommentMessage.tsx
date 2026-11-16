import { IconMessage, IconQuote } from "@tabler/icons-react";
import { Surface, ListEnter } from "@vvedantb/ui";
import { cn } from "@eva/ui";
import {
  parseCitationSegments,
  type CitationMessageSegment,
} from "@/lib/components/chat/assistantCitation";
import { usePendingCitations } from "@/lib/contexts/PendingCitationsContext";
import {
  MarkdownMentionText,
  PlainMarkdownText,
} from "@/lib/components/chat/MarkdownMentionText";
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";
import {
  parseReviewCommentSegments,
  type ReviewCommentMessageSegment,
} from "@eva/shared";

interface ReviewCommentMessageProps {
  text: string;
  /** Absent (Manager Ave): plain markdown, no mention chips. */
  repo?: ChatRepo;
}

// `wrap-anywhere` rather than `wrap-break-word`: only the former shrinks the
// min-content width, so an unbreakable token (JWT, long URL) wraps inside the
// bubble instead of widening it. `pre` blocks are unaffected (white-space: pre).
const BODY_CLASS = "text-sm wrap-anywhere";

// This component only ever renders user-authored chat messages, whose composer
// offers both teammates and data entities, so every `@` token here needs its
// kind resolved (`atKind="user"`) rather than assumed to be data.

/** One text run of a user message, with mention chips when there is a repo. */
function MessageText({ text, repo }: { text: string; repo?: ChatRepo }) {
  if (!repo) return <PlainMarkdownText text={text} className={BODY_CLASS} />;
  return (
    <MarkdownMentionText
      text={text}
      repoBasePath={repo.basePath}
      repoId={repo.id}
      className={BODY_CLASS}
      atKind="user"
    />
  );
}

function ReviewCommentCard({
  filePath,
  rangeLabel,
  text,
  repo,
}: {
  filePath: string;
  rangeLabel: string;
  text: string;
  repo?: ChatRepo;
}) {
  return (
    <Surface density="tight" className="space-y-2">
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">{filePath}</div>
        <div className="text-2xs text-muted-foreground">{rangeLabel}</div>
      </div>
      {text.length > 0 ? <MessageText text={text} repo={repo} /> : null}
    </Surface>
  );
}

/**
 * A quote the user cited from an Eva reply. Clicking it scrolls to and
 * flashes the source turn, same as the pending chip in the composer.
 */
function CitationCard({
  messageId,
  text,
  comment,
  repo,
}: {
  messageId: string;
  text: string;
  comment: string;
  repo?: ChatRepo;
}) {
  const citations = usePendingCitations();
  return (
    <div className="space-y-2">
      <Surface density="none" className="overflow-hidden">
        {/* design-check-ignore-next-line — a full-width quote row inside the Surface; Button would force control height and padding */}
        <button
          type="button"
          disabled={!citations}
          onClick={() => citations?.reveal(messageId)}
          title={citations ? "Show in conversation" : undefined}
          className={cn(
            "flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground",
            citations &&
              "transition-colors hover:bg-muted/40 hover:text-foreground",
          )}
        >
          <IconQuote className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-4 min-w-0">{text}</span>
        </button>
      </Surface>
      {comment.length > 0 ? <MessageText text={comment} repo={repo} /> : null}
    </div>
  );
}

export function ReviewCommentMessage({
  text,
  repo,
}: ReviewCommentMessageProps) {
  const parsed = parseReviewCommentSegments(text).flatMap<
    ReviewCommentMessageSegment | CitationMessageSegment
  >((segment) =>
    segment.kind === "text"
      ? parseCitationSegments(segment.text).map((part) => ({
          ...part,
          id: `${segment.id}:${part.id}`,
        }))
      : [segment],
  );
  // The prompt appends cited quotes after the text; show them first, like a
  // reply quoting what it answers.
  const segments = [
    ...parsed.filter((segment) => segment.kind === "citation"),
    ...parsed.filter((segment) => segment.kind !== "citation"),
  ];
  const hasCards = segments.some((segment) => segment.kind !== "text");

  if (!hasCards) return <MessageText text={text} repo={repo} />;

  return (
    <div className="flex flex-col gap-4">
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          segment.text.trim().length > 0 ? (
            <MessageText key={segment.id} text={segment.text} repo={repo} />
          ) : null
        ) : segment.kind === "citation" ? (
          <ListEnter key={segment.id} index={index} fast>
            <CitationCard
              messageId={segment.messageId}
              text={segment.text}
              comment={segment.comment}
              repo={repo}
            />
          </ListEnter>
        ) : (
          <ListEnter key={segment.comment.id} index={index} fast>
            <div className="flex items-start gap-2">
              <IconMessage className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <ReviewCommentCard
                filePath={segment.comment.filePath}
                rangeLabel={segment.comment.rangeLabel}
                text={segment.comment.text}
                repo={repo}
              />
            </div>
          </ListEnter>
        ),
      )}
    </div>
  );
}
