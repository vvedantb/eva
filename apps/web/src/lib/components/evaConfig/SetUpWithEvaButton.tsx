"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, Spinner, toast } from "@eva/ui";
import { IconSparkles } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { systemSkillTokenId } from "@/lib/components/mentions";
import { formatSkillToken } from "@/lib/components/mentions/skillToken";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

const EVA_SETUP_SKILL = "eva-setup";

/**
 * Starts a new session whose first message runs the `eva-setup` skill. The
 * message is the same skill chip the `/` picker inserts, so the chat shows it
 * as a skill and the backend strips it to `/eva-setup`. No base branch is
 * sent: the session starts from the repo's default branch, which is the
 * branch Eva syncs `.eva/` from.
 */
export function SetUpWithEvaButton() {
  const navigate = useNavigate();
  const { repoId, basePath } = useRepo();
  const createSession = useMutation(api.sessions.create);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const { numId } = await createSession({
        repoId,
        title: "Set up with Eva",
        message: formatSkillToken(
          EVA_SETUP_SKILL,
          systemSkillTokenId(EVA_SETUP_SKILL),
        ),
      });
      await navigate({
        to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start a session",
      );
      setStarting(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      className="shrink-0"
      disabled={starting}
      onClick={() => void start()}
    >
      {starting ? <Spinner size="sm" /> : <IconSparkles size={14} />}
      Set up with Eva
    </Button>
  );
}
