import { prStateLabel, repoDisplayLabel, type PrState } from "@eva/shared";
import type { NeedsYouReason } from "@eva/shared/projectStatus";
import { NEEDS_YOU_LABELS } from "@eva/shared/projectView";
import { IconClock, IconMessage, IconStack2 } from "@tabler/icons-react-native";
import { MetaPill } from "@/quickTasks/QuickTaskRow";
import { PrIcon, RepoAppMark, type RepoRow } from "@/sessions/SessionGroup";
import { NeedsYouMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

/**
 * A project task's badges, as the web `ProjectTaskBadges`: why it needs
 * you (the warning triangle), that it waits for its coordinator, its phase
 * label, a feedback origin (the message icon), its repo when it is not the
 * home repo, and its PR state. The task list and the coordinator chat's
 * batch card share it.
 */
export function ProjectTaskBadges({
  needsYou,
  waitingForCoordinator,
  phaseLabel,
  isFeedback,
  repo,
  prState,
  hasPr,
}: {
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
  phaseLabel: string | undefined;
  isFeedback: boolean;
  /** Set only when the task's repo differs from the project's home repo. */
  repo: RepoRow | undefined;
  prState: PrState | undefined;
  hasPr: boolean;
}) {
  const scheme = useScheme();
  return (
    <>
      {needsYou ? <MetaPill leading={<NeedsYouMark size={12} />} label={NEEDS_YOU_LABELS[needsYou]} /> : null}
      {waitingForCoordinator ? <MetaPill icon={IconClock} label="Waiting for coordinator" /> : null}
      {phaseLabel ? <MetaPill icon={IconStack2} label={phaseLabel} /> : null}
      {isFeedback ? <MetaPill icon={IconMessage} label="Feedback" /> : null}
      {repo ? <MetaPill leading={<RepoAppMark repo={repo} scheme={scheme} />} label={repoDisplayLabel(repo)} /> : null}
      {hasPr ? <MetaPill leading={<PrIcon state={prState} scheme={scheme} size={12} />} label={prStateLabel(prState)} /> : null}
    </>
  );
}

/** True when a project task row has any badge to show. */
export function hasProjectTaskBadges(badges: {
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
  phaseLabel: string | undefined;
  isFeedback: boolean;
  repo: RepoRow | undefined;
  hasPr: boolean;
}): boolean {
  return (
    badges.needsYou !== undefined ||
    badges.waitingForCoordinator ||
    badges.phaseLabel !== undefined ||
    badges.isFeedback ||
    badges.repo !== undefined ||
    badges.hasPr
  );
}
