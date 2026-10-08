import { IconMessage } from "@tabler/icons-react";
import { Surface } from "@eva/ui";
import {
  MarkdownMentionText,
  PlainMarkdownText,
} from "@/lib/components/chat/MarkdownMentionText";
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";
import { parseReviewCommentSegments } from "@/lib/reviewComments";
import { ListEnter } from "@/lib/components/ui/ListEnter";

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

export function ReviewCommentMessage({
  text,
  repo,
}: ReviewCommentMessageProps) {
  const segments = parseReviewCommentSegments(text);
  const hasReviewComments = segments.some(
    (segment) => segment.kind === "review-comment",
  );

  if (!hasReviewComments) return <MessageText text={text} repo={repo} />;

  return (
    <div className="space-y-3">
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          segment.text.trim().length > 0 ? (
            <MessageText key={segment.id} text={segment.text} repo={repo} />
          ) : null
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
