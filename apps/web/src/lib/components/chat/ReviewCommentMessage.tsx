import { IconMessage } from "@tabler/icons-react";
import { Surface } from "@eva/ui";
import { MarkdownMentionText } from "@/lib/components/chat/MarkdownMentionText";
import { useRepo } from "@/lib/contexts/RepoContext";
import { parseReviewCommentSegments } from "@/lib/reviewComments";
import { ListEnter } from "@/lib/components/ui/ListEnter";

interface ReviewCommentMessageProps {
  text: string;
  repoBasePath: string;
}

// `wrap-anywhere` rather than `wrap-break-word`: only the former shrinks the
// min-content width, so an unbreakable token (JWT, long URL) wraps inside the
// bubble instead of widening it. `pre` blocks are unaffected (white-space: pre).
const BODY_CLASS = "text-sm wrap-anywhere";

// This component only ever renders user-authored chat messages, whose composer
// offers both teammates and data entities, so every `@` token here needs its
// kind resolved (`atKind="user"`) rather than assumed to be data.

function ReviewCommentCard({
  filePath,
  rangeLabel,
  text,
  repoBasePath,
}: {
  filePath: string;
  rangeLabel: string;
  text: string;
  repoBasePath: string;
}) {
  const { repo } = useRepo();

  return (
    <Surface density="tight" className="space-y-2">
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">{filePath}</div>
        <div className="text-[11px] text-muted-foreground">{rangeLabel}</div>
      </div>
      {text.length > 0 ? (
        <MarkdownMentionText
          text={text}
          repoBasePath={repoBasePath}
          repoId={repo._id}
          className={BODY_CLASS}
          atKind="user"
        />
      ) : null}
    </Surface>
  );
}

export function ReviewCommentMessage({
  text,
  repoBasePath,
}: ReviewCommentMessageProps) {
  const { repo } = useRepo();
  const segments = parseReviewCommentSegments(text);
  const hasReviewComments = segments.some(
    (segment) => segment.kind === "review-comment",
  );

  if (!hasReviewComments) {
    return (
      <MarkdownMentionText
        text={text}
        repoBasePath={repoBasePath}
        repoId={repo._id}
        className={BODY_CLASS}
        atKind="user"
      />
    );
  }

  return (
    <div className="space-y-3">
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          segment.text.trim().length > 0 ? (
            <MarkdownMentionText
              key={segment.id}
              text={segment.text}
              repoBasePath={repoBasePath}
              repoId={repo._id}
              className={BODY_CLASS}
              atKind="user"
            />
          ) : null
        ) : (
          <ListEnter key={segment.comment.id} index={index} fast>
            <div className="flex items-start gap-2">
              <IconMessage className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <ReviewCommentCard
                filePath={segment.comment.filePath}
                rangeLabel={segment.comment.rangeLabel}
                text={segment.comment.text}
                repoBasePath={repoBasePath}
              />
            </div>
          </ListEnter>
        ),
      )}
    </div>
  );
}
