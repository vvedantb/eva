"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useQueryState } from "nuqs";
import { api } from "@eva/backend";
import {
  CenteredSpinner,
  EmptyState,
  staggerDelay,
  tokenTransition,
} from "@vvedantb/ui";
import { m } from "motion/react";
import { IconThumbUp } from "@tabler/icons-react";
import { PageWrapper } from "@/lib/components/PageWrapper";
import {
  feedbackAuthorParser,
  feedbackRepoParser,
  feedbackSentimentParser,
} from "@/lib/search-params";
import { FeedbackFilter } from "./_components/FeedbackFilter";
import { FeedbackRow, type FeedbackListRow } from "./_components/FeedbackRow";

function repoKey(row: FeedbackListRow): string | null {
  return row.source ? `${row.source.owner}/${row.source.repo}` : null;
}

/**
 * Every thumbs rating and agent `submit_feedback` report the viewer can see,
 * newest first. Filters live in the URL (nuqs) and run over the loaded list.
 */
export function FeedbackClient() {
  const rows = useQuery(api.feedback.list);
  const [sentiment, setSentiment] = useQueryState(
    "sentiment",
    feedbackSentimentParser,
  );
  const [author, setAuthor] = useQueryState("from", feedbackAuthorParser);
  const [repo, setRepo] = useQueryState("repo", feedbackRepoParser);

  const repos = [
    ...new Set(
      (rows ?? [])
        .map(repoKey)
        .filter((key): key is string => key !== null),
    ),
  ].sort();
  const visible = (rows ?? []).filter(
    (row) =>
      (sentiment === null || row.sentiment === sentiment) &&
      (author === null || row.author === author) &&
      (repo === null || repoKey(row) === repo),
  );

  return (
    <PageWrapper title="Feedback" comfortable>
      {rows === undefined ? (
        <CenteredSpinner label="Loading feedback" />
      ) : rows.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Icon icon={IconThumbUp} size={24} />
          <EmptyState.Title>No feedback yet</EmptyState.Title>
          <EmptyState.Description>
            Thumbs on Eva replies, and feedback Eva sends when a chat goes well
            or badly, show up here.
          </EmptyState.Description>
        </EmptyState.Root>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <FeedbackFilter
              label="Rating"
              value={sentiment}
              options={[
                { value: "positive", label: "Positive" },
                { value: "negative", label: "Negative" },
              ]}
              onChange={(next) => void setSentiment(next)}
            />
            <FeedbackFilter
              label="From"
              value={author}
              options={[
                { value: "user", label: "Users" },
                { value: "agent", label: "Eva" },
              ]}
              onChange={(next) => void setAuthor(next)}
            />
            {repos.length > 1 ? (
              <FeedbackFilter
                label="Repo"
                value={repo}
                options={repos.map((key) => ({ value: key, label: key }))}
                onChange={(next) => void setRepo(next)}
              />
            ) : null}
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No feedback matches these filters.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {visible.map((row, index) => (
                <m.li
                  key={row._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    ...tokenTransition.base,
                    delay: staggerDelay(index),
                  }}
                >
                  <FeedbackRow row={row} />
                </m.li>
              ))}
            </ol>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
