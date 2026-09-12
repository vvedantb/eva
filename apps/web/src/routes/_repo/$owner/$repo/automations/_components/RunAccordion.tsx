import { useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Doc } from "@eva/backend";
import {
  ActivityTasks,
  Badge,
  Button,
  useElapsedSeconds,
  formatElapsed,
  Spinner as UISpinner,
  Surface,
  motionFast,
} from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconExternalLink,
  IconPlayerStop,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { formatDuration } from "@eva/shared/duration";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { FindingsList } from "./FindingsList";

const summaryPlugins = { cjk, math, mermaid };

export function LatestRun({
  run,
  loading,
  actionsEnabled,
  repoOwner,
  repoName,
}: {
  run: Doc<"automationRuns"> | undefined;
  loading: boolean;
  actionsEnabled: boolean;
  repoOwner: string;
  repoName: string;
}) {
  const acknowledgeRun = useMutation(api.automations.acknowledgeRun);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <UISpinner size="lg" />
      </div>
    );
  }

  if (!run) {
    return (
      <Surface density="comfortable" className="text-center">
        <p className="text-sm text-muted-foreground">
          No runs yet. Enable the automation and wait for the cron schedule to
          trigger, or click &quot;Run Now&quot;.
        </p>
      </Surface>
    );
  }

  return (
    <Surface density="none" className="overflow-hidden">
      <RunAccordion
        run={run}
        actionsEnabled={actionsEnabled}
        repoOwner={repoOwner}
        repoName={repoName}
        onAcknowledge={() => acknowledgeRun({ runId: run._id })}
        defaultExpanded
      />
    </Surface>
  );
}

export function RunHistory({
  runs,
  actionsEnabled,
  repoOwner,
  repoName,
}: {
  runs: Doc<"automationRuns">[] | undefined;
  actionsEnabled: boolean;
  repoOwner: string;
  repoName: string;
}) {
  const acknowledgeRun = useMutation(api.automations.acknowledgeRun);

  if (runs === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <UISpinner size="lg" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <Surface density="comfortable" className="text-center">
        <p className="text-sm text-muted-foreground">
          No runs yet. Enable the automation and wait for the cron schedule to
          trigger, or click &quot;Run Now&quot;.
        </p>
      </Surface>
    );
  }

  return (
    <Surface
      density="none"
      className="overflow-hidden divide-y divide-border/50"
    >
      {runs.map((run, index) => (
        <ListEnter key={run._id} index={index}>
          <RunAccordion
            run={run}
            actionsEnabled={actionsEnabled}
            repoOwner={repoOwner}
            repoName={repoName}
            onAcknowledge={() => acknowledgeRun({ runId: run._id })}
          />
        </ListEnter>
      ))}
    </Surface>
  );
}

function RunAccordion({
  run,
  actionsEnabled,
  repoOwner,
  repoName,
  onAcknowledge,
  defaultExpanded,
}: {
  run: Doc<"automationRuns">;
  actionsEnabled: boolean;
  repoOwner: string;
  repoName: string;
  onAcknowledge: () => void;
  defaultExpanded?: boolean;
}) {
  const isActive = run.status === "running" || run.status === "queued";
  const [expanded, setExpanded] = useState(defaultExpanded ?? isActive);
  const cancelRun = useMutation(api.automations.cancelRun);

  const streamingEntityId = `automation-run-${run._id}`;
  const streaming = useQuery(
    api.streaming.get,
    isActive ? { entityId: streamingEntityId } : "skip",
  );

  const elapsed = useElapsedSeconds(run.startedAt, isActive);

  const badgeVariant =
    run.status === "success"
      ? "success"
      : run.status === "error"
        ? "destructive"
        : run.status === "running"
          ? "warning"
          : "secondary";

  const duration =
    run.finishedAt && run.startedAt
      ? formatDuration(run.startedAt, run.finishedAt)
      : isActive && run.startedAt
        ? formatElapsed(elapsed)
        : "";

  const liveSteps = streaming?.currentActivity
    ? parseActivitySteps(streaming.currentActivity)
    : null;
  const completedSteps = run.activityLog
    ? parseActivitySteps(run.activityLog)
    : null;
  // When findings render below instead of resultSummary, the activity's
  // trailing response text isn't shown as adjacent final text.
  const showsFindings = Boolean(
    actionsEnabled && run.findings && run.findings.length > 0,
  );

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          const willExpand = !expanded;
          setExpanded(willExpand);
          if (willExpand && !run.acknowledged && !isActive) {
            onAcknowledge();
          }
        }}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/50 sm:flex-nowrap sm:gap-3 sm:px-4"
      >
        {expanded ? (
          <IconChevronDown
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        ) : (
          <IconChevronRight
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        )}
        <Badge variant={badgeVariant}>{run.status}</Badge>
        <span className="text-xs text-muted-foreground sm:text-sm">
          {dayjs(run.startedAt).format("DD/MM HH:mm")}
        </span>
        <span className="hidden flex-1 truncate text-sm font-medium sm:block">
          {run.resultSummary
            ? run.resultSummary.slice(0, 80)
            : run.error
              ? run.error.slice(0, 80)
              : ""}
        </span>
        {duration && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {duration}
          </span>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {isActive ? (
            <m.span
              key="stop"
              className="inline-flex shrink-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <Button
                size="sm"
                variant="destructive"
                className="shrink-0 h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  void withMutationToast(
                    cancelRun({ runId: run._id }),
                    "Run stopped",
                    "Couldn't stop run",
                    "automation-run-stop",
                  );
                }}
              >
                <IconPlayerStop size={12} />
                Stop
              </Button>
            </m.span>
          ) : !run.acknowledged &&
            run.status !== "queued" &&
            run.status !== "running" ? (
            <m.span
              key="read"
              className="inline-flex shrink-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge();
                }}
              >
                <IconCheck size={12} />
                Read
              </Button>
            </m.span>
          ) : run.acknowledged ? (
            <m.span
              key="acknowledged"
              className="shrink-0 text-xs text-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              Read
            </m.span>
          ) : null}
        </AnimatePresence>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
            className="px-4 py-3 space-y-3"
          >
            {isActive && liveSteps && (
              <ActivityTasks steps={liveSteps} isStreaming />
            )}
            {!isActive && completedSteps && (
              <ActivityTasks
                steps={completedSteps}
                finalText={showsFindings ? undefined : run.resultSummary}
              />
            )}
            {showsFindings ? (
              <FindingsList
                run={run}
                repoOwner={repoOwner}
                repoName={repoName}
              />
            ) : (
              <>
                {actionsEnabled &&
                  run.resultSummary &&
                  !run.findings &&
                  run.status === "success" && (
                    <div className="flex items-center gap-2 rounded-surface bg-warning/10 px-3 py-2">
                      <IconAlertTriangle
                        size={14}
                        className="shrink-0 text-warning"
                      />
                      <p className="text-xs text-warning">
                        Could not parse findings from report
                      </p>
                    </div>
                  )}
                {run.resultSummary && (
                  <div>
                    <Streamdown
                      className="text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      plugins={summaryPlugins}
                    >
                      {run.resultSummary}
                    </Streamdown>
                  </div>
                )}
              </>
            )}
            {run.error && (
              <div>
                <p className="text-xs font-medium text-destructive mb-1">
                  Error
                </p>
                <p className="text-sm text-destructive whitespace-pre-wrap max-sm:wrap-break-word">
                  {run.error}
                </p>
              </div>
            )}
            {run.prUrl && (
              <div>
                <a
                  href={run.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="max-sm:hit-target inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <IconExternalLink size={14} />
                  View Pull Request
                </a>
              </div>
            )}
            {!isActive &&
              !run.resultSummary &&
              !run.error &&
              !completedSteps && (
                <p className="text-sm text-muted-foreground">
                  No details available.
                </p>
              )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
