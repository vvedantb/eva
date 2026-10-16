"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api, type RecapWalkthroughStep } from "@eva/backend";
import { Button, Spinner, toast } from "@eva/ui";
import { IconMessageQuestion } from "@tabler/icons-react";
import { useSeedChatDraft } from "@/lib/components/chat/useSeedChatDraft";
import type { ChatDraftTarget } from "@/lib/components/chat/useChatDraftSeed";
import { useReviewChatTarget } from "@/lib/contexts/ReviewChatTargetContext";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

interface RecapAskAgentButtonProps {
  step: RecapWalkthroughStep;
  prUrl: string;
  prNumber: number;
  /**
   * Branch a new session starts on: the head branch of an open PR from this
   * repo, so the agent reads the code under review. Null starts on the repo's
   * default branch (a fork, or a closed PR whose change is on the base).
   */
  workBranch: string | null;
}

/** The prompt both paths send: the step as context, then a default question. */
function stepPrompt({
  step,
  prUrl,
  prNumber,
}: Pick<RecapAskAgentButtonProps, "step" | "prUrl" | "prNumber">) {
  const files =
    step.files.length > 0
      ? `\nFiles: ${step.files.map((path) => `\`${path}\``).join(", ")}`
      : "";
  return `About PR #${prNumber} (${prUrl}), recap step "${step.title}":${files}

${step.summary}

Explain this step in more depth: what changed, why, and what could break.`;
}

/**
 * "Ask agent" on a recap step. Beside a chat (a sandbox's Review tab), the
 * question goes into that chat's draft so the reader can edit it before
 * sending. Elsewhere there is no chat to use, so it starts a new session on
 * the PR's branch when it has one.
 */
export function RecapAskAgentButton(props: RecapAskAgentButtonProps) {
  const target = useReviewChatTarget();
  return target === null ? (
    <AskInNewSession {...props} />
  ) : (
    <AskInChat target={target} {...props} />
  );
}

function AskInChat({
  target,
  ...props
}: RecapAskAgentButtonProps & { target: ChatDraftTarget }) {
  const seedChatDraft = useSeedChatDraft(target);
  return <AskButton onClick={() => seedChatDraft(stepPrompt(props))} />;
}

function AskInNewSession(props: RecapAskAgentButtonProps) {
  const navigate = useNavigate();
  const { repoId, basePath } = useRepo();
  const createSession = useMutation(api.sessions.create);

  const start = async () => {
    const { numId } = await createSession({
      repoId,
      title: `PR #${props.prNumber}: ${props.step.title}`,
      message: stepPrompt(props),
      ...(props.workBranch !== null ? { baseBranch: props.workBranch } : {}),
    });
    await navigate({
      to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
    });
  };

  return <AskButton onClick={start} />;
}

function AskButton({ onClick }: { onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      className="motion-press active:scale-[0.96]"
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Couldn't ask the agent",
          );
        }
        setBusy(false);
      }}
    >
      {busy ? (
        <Spinner size="sm" />
      ) : (
        <IconMessageQuestion size={14} aria-hidden />
      )}
      Ask agent
    </Button>
  );
}
