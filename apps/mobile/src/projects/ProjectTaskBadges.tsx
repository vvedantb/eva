import { prStateLabel, repoDisplayLabel, type PrState } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import type { NeedsYouReason } from "@eva/shared/projectStatus";
import { NEEDS_YOU_LABELS, WAITING_FOR_COORDINATOR_LABEL } from "@eva/shared/projectView";
import { IconHelpCircle, IconMessage } from "@tabler/icons-react-native";
import { MetaPill } from "@/quickTasks/QuickTaskRow";
import { PrIcon, RepoAppMark, type RepoRow } from "@/sessions/SessionGroup";
import { NeedsYouMark } from "@/ui/RowStatus";
import { useScheme } from "@/ui/theme";

/** What a project task row's badges show (`ProjectTaskBadges`). */
export interface ProjectTaskBadgeFacts {
  needsYou: NeedsYouReason | undefined;
  waitingForCoordinator: boolean;
  /** The task's open question (`report_to_coordinator` ask). */
  ask: string | undefined;
  /** The task's open reports, newest first. */
  reports: readonly string[];
  phaseLabel: string | undefined;
  isFeedback: boolean;
  /** Set only when the task's repo differs from the project's home repo. */
  repo: RepoRow | undefined;
  hasPr: boolean;
  prState: PrState | undefined;
}

/** True when a project task row has any badge to show. */
export function hasProjectTaskBadges(badges: ProjectTaskBadgeFacts): boolean {
  return (
    badges.needsYou !== undefined ||
    badges.waitingForCoordinator ||
    badges.ask !== undefined ||
    badges.reports.length > 0 ||
    badges.phaseLabel !== undefined ||
    badges.isFeedback ||
    badges.repo !== undefined ||
    badges.hasPr
  );
}

/**
 * A project task row's badges after its tags, as the web
 * `ProjectTaskBadges`: why it needs you (the warning triangle) or that it
 * waits for its coordinator, its open question (the "asked a question"
 * icon; the row opens the task, whose chat answers it), how many open
 * reports it has, its phase label, a feedback origin (the message icon),
 * its repo when it is not the home repo, and its PR state.
 */
export function ProjectTaskBadges({ badges }: { badges: ProjectTaskBadgeFacts }) {
  const scheme = useScheme();
  const { needsYou, waitingForCoordinator, ask, reports, phaseLabel, isFeedback, repo, hasPr, prState } = badges;
  return (
    <>
      {needsYou ? (
        <MetaPill leading={<NeedsYouMark size={12} />} label={NEEDS_YOU_LABELS[needsYou]} />
      ) : waitingForCoordinator ? (
        <MetaPill label={WAITING_FOR_COORDINATOR_LABEL} />
      ) : null}
      {ask ? <MetaPill leading={<IconHelpCircle size={12} color={EVA_THEME[scheme].warning} />} label={ask} /> : null}
      {reports.length > 0 ? <MetaPill label={reports.length === 1 ? "1 report" : `${reports.length} reports`} /> : null}
      {phaseLabel ? <MetaPill label={phaseLabel} /> : null}
      {isFeedback ? <MetaPill icon={IconMessage} label="Feedback" /> : null}
      {repo ? <MetaPill leading={<RepoAppMark repo={repo} scheme={scheme} />} label={repoDisplayLabel(repo)} /> : null}
      {hasPr ? <MetaPill leading={<PrIcon state={prState} scheme={scheme} size={12} />} label={prStateLabel(prState)} /> : null}
    </>
  );
}
