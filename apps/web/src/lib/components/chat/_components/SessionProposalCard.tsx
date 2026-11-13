"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { m } from "motion/react";
import { api, type Doc } from "@eva/backend";
import { Button, tokenTransition, Surface } from "@vvedantb/ui";
import { IconArrowUpRight, IconCornerDownRight } from "@tabler/icons-react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

type SessionProposal = Pick<
  Doc<"sessionProposals">,
  "_id" | "title" | "reason" | "status" | "sessionNumId"
>;

/**
 * A task the agent recommends for its own session (`propose_session`). Nothing
 * runs until the user picks: "New session" opens one on the agent's brief and
 * leaves the user in this chat, "Do it here" tells the agent to carry on here.
 */
export function SessionProposalCard({
  proposal,
  basePath,
  onReply,
}: {
  proposal: SessionProposal;
  /** Repo route prefix for the link to the started session. */
  basePath?: string;
  /**
   * Posts "do it here" to the agent. Undefined when the chat cannot send right
   * now (archived, or the sandbox is asleep), which disables that button only:
   * a new session does not need this chat.
   */
  onReply?: (message: string) => void;
}) {
  if (proposal.status === "pending") {
    return <PendingSessionProposal proposal={proposal} onReply={onReply} />;
  }
  const started = proposal.status === "started";
  const Icon = started ? IconArrowUpRight : IconCornerDownRight;
  const sessionHref =
    started && basePath !== undefined && proposal.sessionNumId !== undefined
      ? toInternalRepoHref(`${basePath}/sessions/${proposal.sessionNumId}`)
      : null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon size={14} className="shrink-0" aria-hidden />
      <span className="truncate">
        {proposal.title} ·{" "}
        {sessionHref !== null ? (
          <DynamicLink to={sessionHref} className="hover:text-foreground">
            started in session {proposal.sessionNumId}
          </DynamicLink>
        ) : started ? (
          "started in a new session"
        ) : (
          "doing it here"
        )}
      </span>
    </div>
  );
}

function PendingSessionProposal({
  proposal,
  onReply,
}: {
  proposal: SessionProposal;
  onReply?: (message: string) => void;
}) {
  const start = useMutation(api.sessionProposals.start);
  const keepHere = useMutation(api.sessionProposals.keepHere);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset is duplicated into the catch instead of using `finally`: React
  // Compiler bails on the whole file when it meets a `finally` clause.
  const answer = async (choose: () => Promise<void>) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // The card turns into its answered row once the query updates.
      await choose();
      setSubmitting(false);
    } catch (cause) {
      setSubmitting(false);
      setError(
        cause instanceof Error ? cause.message : "Could not save your choice.",
      );
    }
  };

  const startSession = async () => {
    await start({ proposalId: proposal._id });
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <Surface density="tight" className="min-w-0 max-w-full">
        <div
          className="flex min-w-0 flex-col gap-3"
          data-testid="session-proposal-card"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Suggested for a new session
            </p>
            <p className="text-sm font-medium text-foreground">
              {proposal.title}
            </p>
            <p className="text-sm text-muted-foreground">{proposal.reason}</p>
          </div>
          {error !== null ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={() => void answer(startSession)}
            >
              New session
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={submitting || onReply === undefined}
              onClick={() => {
                if (onReply === undefined) return;
                void answer(async () => {
                  const { reply } = await keepHere({
                    proposalId: proposal._id,
                  });
                  onReply(reply);
                });
              }}
            >
              Do it here
            </Button>
          </div>
        </div>
      </Surface>
    </m.div>
  );
}
