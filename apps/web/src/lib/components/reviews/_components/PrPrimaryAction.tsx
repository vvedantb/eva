"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation as useConvexMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  CrossfadeIcon,
  Spinner,
  toast,
} from "@eva/ui";
import {
  IconArrowBackUp,
  IconChevronDown,
  IconGitMerge,
  IconGitPullRequest,
} from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { mergeBlocker } from "./prMergeState";
import type { PrOverview } from "./prOverviewMeta";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

type MergeMethod = "merge" | "squash" | "rebase";

const MERGE_METHODS: { value: MergeMethod; label: string }[] = [
  { value: "squash", label: "Squash and merge" },
  { value: "merge", label: "Create a merge commit" },
  { value: "rebase", label: "Rebase and merge" },
];

/**
 * The one loud control on the review surface, in the header where a reader looks
 * for the decision rather than at the foot of a conversation they have to scroll
 * past. What it offers is whatever the pull request's state makes possible:
 *
 * - open — merge, with the method on a dropdown beside it (a segmented control,
 *   because the method is a modifier of this action, not a separate one).
 * - merged — revert, as a session on the base branch. eva cannot undo a merge
 *   through the API; a revert is a code change, so an agent makes it.
 * - closed — reopen.
 *
 * Merging is irreversible and lands on the base branch, so it stays behind an
 * explicit confirmation and any GitHub rejection is surfaced verbatim.
 */
export function PrPrimaryAction({
  repoId,
  overview,
  onDone,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onDone: () => void;
}) {
  if (overview.status === "merged") {
    return <RevertAction overview={overview} />;
  }
  if (overview.status === "closed") {
    return <ReopenAction repoId={repoId} overview={overview} onDone={onDone} />;
  }
  return <MergeAction repoId={repoId} overview={overview} onDone={onDone} />;
}

function MergeAction({
  repoId,
  overview,
  onDone,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onDone: () => void;
}) {
  const mergePr = useAction(api.github.mergePullRequest);
  const [method, setMethod] = useState<MergeMethod>("squash");
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const altHeld = useAltHeld();

  const canMerge = !overview.draft && overview.mergeable === true;
  const blocked = mergeBlocker(overview)?.detail ?? null;
  const methodLabel =
    MERGE_METHODS.find((entry) => entry.value === method)?.label ?? "Merge";

  const runMerge = async () => {
    setMerging(true);
    // No `||` in the try and no `finally`: React Compiler bails on the whole
    // file for either.
    try {
      const result = await mergePr({
        repoId,
        prNumber: overview.number,
        method,
      });
      setConfirming(false);
      if (result.message) {
        toast.success(result.message);
      } else {
        toast.success("Pull request merged");
      }
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not merge the branch",
      );
    }
    setMerging(false);
  };

  return (
    <>
      <ButtonGroup>
        <Button
          size="sm"
          disabled={!canMerge}
          onClick={(event) =>
            requestConfirm(
              altHeld,
              () => setConfirming(true),
              () => {
                void runMerge();
              },
              event,
            )
          }
          title={blocked ?? skipConfirmTitle(methodLabel)}
        >
          <IconGitMerge size={14} aria-hidden />
          Merge
          <ConfirmSkipHint />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!canMerge}
              className="px-1.5"
              aria-label="Choose a merge method"
            >
              <IconChevronDown size={14} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {MERGE_METHODS.map((entry) => (
              <DropdownMenuItem
                key={entry.value}
                onSelect={() => setMethod(entry.value)}
              >
                {entry.label}
                {entry.value === method ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    selected
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{methodLabel}?</DialogTitle>
            <DialogDescription>
              This merges <span className="font-mono">{overview.headRef}</span>{" "}
              into <span className="font-mono">{overview.baseRef}</span> on
              GitHub. It cannot be undone from Eva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={merging}
            >
              Cancel
            </Button>
            <Button onClick={() => void runMerge()} disabled={merging}>
              <CrossfadeIcon
                show={merging}
                trueKey="loading"
                falseKey="idle"
                variant="soft"
                className="relative flex size-3.5 items-center justify-center"
                whenTrue={<Spinner size="sm" />}
                whenFalse={<IconGitMerge size={14} />}
              />
              {merging ? "Merging" : methodLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReopenAction({
  repoId,
  overview,
  onDone,
}: {
  repoId: Id<"githubRepos">;
  overview: PrOverview;
  onDone: () => void;
}) {
  const update = useAction(api.github.updatePullRequest);
  const [working, setWorking] = useState(false);

  const reopen = async () => {
    setWorking(true);
    try {
      await update({ repoId, prNumber: overview.number, state: "open" });
      toast.success("Pull request reopened");
      onDone();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reopen the branch",
      );
    }
    setWorking(false);
  };

  return (
    <Button size="sm" disabled={working} onClick={() => void reopen()}>
      <CrossfadeIcon
        show={working}
        trueKey="loading"
        falseKey="idle"
        variant="soft"
        className="relative flex size-3.5 items-center justify-center"
        whenTrue={<Spinner size="sm" />}
        whenFalse={<IconGitPullRequest size={14} />}
      />
      Reopen
    </Button>
  );
}

/**
 * Revert as work, not as an API call. GitHub has no "undo this merge" endpoint —
 * the revert is a commit on the base branch — so this starts a session there with
 * the revert already asked for, the same shape as the header's conflict remedy.
 */
function RevertAction({ overview }: { overview: PrOverview }) {
  const navigate = useNavigate();
  const { repoId, basePath } = useRepo();
  const createSession = useConvexMutation(api.sessions.create);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const altHeld = useAltHeld();

  const sha = overview.mergeCommitSha;

  const start = async () => {
    setStarting(true);
    // Built before the `try`: expression-level control flow inside one bails
    // the whole file out of the React Compiler.
    let message = `Revert the changes pull request #${overview.number} ("${overview.title}") merged into \`${overview.baseRef}\`. Open a pull request with the revert.`;
    if (sha !== null) {
      message = `Revert merge commit \`${sha}\` (pull request #${overview.number}, "${overview.title}") on \`${overview.baseRef}\`. Use \`git revert -m 1 ${sha}\` if it is a merge commit, resolve any conflicts, then open a pull request with the revert.`;
    }
    try {
      const { numId } = await createSession({
        repoId,
        title: `Revert #${overview.number}`,
        message,
        baseBranch: overview.baseRef,
      });
      await navigate({ to: `${basePath}/sessions/${numId}` });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start a session",
      );
      setStarting(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        title={skipConfirmTitle("Revert")}
        onClick={(event) =>
          requestConfirm(
            altHeld,
            () => setConfirming(true),
            () => {
              void start();
            },
            event,
          )
        }
      >
        <IconArrowBackUp size={14} aria-hidden />
        Revert
        <ConfirmSkipHint />
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert this pull request?</DialogTitle>
            <DialogDescription>
              A merge cannot be undone through GitHub, so this starts a session
              on <span className="font-mono">{overview.baseRef}</span> that
              writes the revert and opens a pull request for it. Nothing changes
              until that pull request is merged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={starting}
            >
              Cancel
            </Button>
            <Button onClick={() => void start()} disabled={starting}>
              <CrossfadeIcon
                show={starting}
                trueKey="loading"
                falseKey="idle"
                variant="soft"
                className="relative flex size-3.5 items-center justify-center"
                whenTrue={<Spinner size="sm" />}
                whenFalse={<IconArrowBackUp size={14} />}
              />
              Start a session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
