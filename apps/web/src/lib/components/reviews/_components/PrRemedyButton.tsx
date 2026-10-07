"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { CrossfadeIconSlot, Spinner, cn, toast } from "@eva/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { PrRemedy } from "./prMergeState";
import type { StatusTone } from "./prOverviewMeta";

const TONE_CLASS: Record<StatusTone, string> = {
  failure: "text-destructive",
  pending: "text-muted-foreground hover:text-foreground",
  neutral: "text-muted-foreground hover:text-foreground",
  success: "text-emerald-700 dark:text-emerald-300",
};

/**
 * Turns a merge blocker into work. Conflicts and a stale branch are both ordinary
 * agent tasks, and eva already knows how to run one on a branch — so rather than
 * reporting GitHub's verdict and stopping, the header offers a session started on
 * the head branch with the fix already asked for.
 *
 * A link rather than a button, and in the blocker's own colour: it belongs to the
 * verdict beside it, and a filled control here would be the loudest thing on a
 * header whose job is to stay quiet until something is wrong.
 *
 * The session opens on `headRef`, not the base: the work has to land on the branch
 * the pull request is built from.
 */
export function PrRemedyButton({
  remedy,
  headRef,
  tone,
}: {
  remedy: PrRemedy;
  headRef: string;
  tone: StatusTone;
}) {
  const navigate = useNavigate();
  const { repoId, basePath } = useRepo();
  const createSession = useMutation(api.sessions.create);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const { numId } = await createSession({
        repoId,
        title: remedy.sessionTitle,
        message: remedy.prompt,
        baseBranch: headRef,
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
    <button
      type="button"
      disabled={starting}
      onClick={() => void start()}
      className={cn(
        "max-sm:hit-target motion-press inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline active:scale-[0.98] disabled:no-underline disabled:opacity-70",
        TONE_CLASS[tone],
      )}
    >
      {remedy.action}
      <CrossfadeIconSlot
        iconKey={starting ? "loading" : "go"}
        className="relative flex size-3.5 items-center justify-center"
      >
        {starting ? (
          <Spinner size="sm" />
        ) : (
          <IconArrowUpRight size={13} aria-hidden />
        )}
      </CrossfadeIconSlot>
    </button>
  );
}
