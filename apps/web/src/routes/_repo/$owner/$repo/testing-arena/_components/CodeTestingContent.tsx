import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { AnimatePresence, m } from "motion/react";
import {
  ActivityTasks,
  Button,
  Spinner,
  TestResultError,
  TestResultErrorMessage,
  tokenTransition,
} from "@vvedantb/ui";
import {
  IconCheck,
  IconAlertTriangle,
  IconGitPullRequest,
  IconTool,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { IssuesList } from "./IssuesList";
import {
  ArenaListButton,
  ArenaListLabel,
  ArenaRunStatusRow,
  ArenaSplitPane,
} from "./ArenaSplitPane";

type EvaluationReport = FunctionReturnType<
  typeof api.evaluationReports.listByDoc
>[number];

function ReportCard({
  report,
  streamingActivity,
}: {
  report: EvaluationReport;
  streamingActivity?: string;
}) {
  const startFix = useMutation(api.evaluationWorkflow.startFix);
  const [isStartingFix, setIsStartingFix] = useState(false);

  const issues = report.issues ?? [];

  const handleFix = async () => {
    setIsStartingFix(true);
    try {
      await startFix({ reportId: report._id });
    } catch (error) {
      setIsStartingFix(false);
      throw error;
    }
    setIsStartingFix(false);
  };

  if (report.status === "running") {
    const steps = parseActivitySteps(streamingActivity);
    return steps ? (
      <div className="px-1 py-3">
        <ActivityTasks steps={steps} isStreaming />
      </div>
    ) : (
      <div className="flex items-center gap-3 px-1 py-3">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground truncate">
          {streamingActivity || "Reviewing codebase..."}
        </span>
      </div>
    );
  }

  if (report.status === "error" && report.error) {
    return (
      <TestResultError>
        <TestResultErrorMessage>{report.error}</TestResultErrorMessage>
      </TestResultError>
    );
  }

  if (report.status !== "completed") return null;

  const toolbarKey =
    report.fixStatus === "fixing"
      ? "fixing"
      : report.fixStatus === "fix_error"
        ? "retry"
        : issues.length > 0 && report.fixStatus === undefined
          ? "fix"
          : report.prUrl
            ? "pr"
            : null;
  const fixSteps =
    report.fixStatus === "fixing"
      ? parseActivitySteps(streamingActivity)
      : null;

  return (
    <div className="space-y-3">
      <div className="flex max-sm:flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {issues.length === 0
            ? "No issues found"
            : `${issues.length} issue${issues.length === 1 ? "" : "s"} found`}
        </span>
        <div className="flex max-sm:flex-wrap items-center gap-2">
          <AnimatePresence mode="wait" initial={false}>
            {toolbarKey ? (
              <m.div
                key={toolbarKey}
                className="flex max-sm:flex-wrap items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={tokenTransition.fast}
              >
                {toolbarKey === "fix" ? (
                  <Button
                    size="sm"
                    onClick={handleFix}
                    disabled={isStartingFix}
                  >
                    <IconTool size={14} />
                    {isStartingFix ? "Starting..." : "Fix issues"}
                  </Button>
                ) : toolbarKey === "fixing" ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Spinner size="sm" />
                    Fixing issues...
                  </span>
                ) : toolbarKey === "retry" ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-destructive">
                      <IconAlertTriangle size={14} />
                      Fix failed
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleFix}
                      disabled={isStartingFix}
                    >
                      <IconTool size={14} />
                      {isStartingFix ? "Starting..." : "Retry fix"}
                    </Button>
                  </>
                ) : null}
                {report.prUrl ? (
                  <a
                    href={report.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-sm:hit-target inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                  >
                    <IconGitPullRequest size={14} aria-hidden />
                    View Fix PR
                  </a>
                ) : null}
              </m.div>
            ) : null}
          </AnimatePresence>
          <RelativeDateTime
            at={report.createdAt}
            className="text-sm text-muted-foreground"
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {report.fixStatus === "fixing" ? (
          <m.div
            key="fix-progress"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={tokenTransition.fast}
          >
            {fixSteps ? (
              <div className="rounded-surface border border-primary/20 bg-primary/5 px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <IconTool size={14} className="text-primary shrink-0" />
                  <span className="text-xs font-medium text-primary">
                    Fixing issues...
                  </span>
                </div>
                <ActivityTasks steps={fixSteps} isStreaming />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-surface border border-primary/20 bg-primary/5 px-3 py-2">
                <IconTool size={14} className="text-primary shrink-0" />
                <span className="text-sm text-primary">
                  {streamingActivity ||
                    "Eva is fixing the flagged issues and will create a PR automatically..."}
                </span>
              </div>
            )}
          </m.div>
        ) : null}
      </AnimatePresence>

      {report.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {report.summary}
        </p>
      )}

      <IssuesList report={report} />
    </div>
  );
}

function RunListItem({
  report,
  isActive,
  onClick,
}: {
  report: EvaluationReport;
  isActive: boolean;
  onClick: () => void;
}) {
  const issueCount = (report.issues ?? []).length;

  return (
    <ArenaListButton isActive={isActive} onClick={onClick}>
      {report.status === "completed" && (
        <>
          {issueCount === 0 ? (
            <IconCheck size={14} className="text-success shrink-0" />
          ) : report.prUrl ? (
            <IconGitPullRequest size={14} className="text-primary shrink-0" />
          ) : (
            <IconAlertTriangle
              size={14}
              className="text-destructive shrink-0"
            />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm tabular-nums">
              {issueCount === 0
                ? "No issues"
                : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
            </span>
            <span className="text-xs text-muted-foreground">
              <RelativeDateTime at={report.createdAt} />
              {report.fixStatus === "fixing" && " · Fixing..."}
              {report.prUrl && " · PR created"}
            </span>
          </div>
        </>
      )}
      <ArenaRunStatusRow status={report.status} createdAt={report.createdAt} />
    </ArenaListButton>
  );
}

/** Code tab: spec-vs-code review runs (list) and the selected run's issues. */
export function CodeTestingContent({
  reports,
  streamingActivity,
}: {
  reports: EvaluationReport[] | undefined;
  streamingActivity?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeId =
    selectedId ??
    reports?.find((r) => r.status === "running")?._id ??
    reports?.[0]?._id ??
    null;
  const activeReport = reports?.find((r) => r._id === activeId);

  if (reports === undefined) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
        <p className="text-sm">No test runs yet</p>
        <p className="text-xs mt-1">
          Click &quot;Run Test&quot; to evaluate this doc
        </p>
      </div>
    );
  }

  return (
    <ArenaSplitPane
      detailKey={activeReport?._id ?? null}
      list={
        <>
          <ArenaListLabel>Test runs ({reports.length})</ArenaListLabel>
          {reports.map((report, index) => (
            <ListEnter key={report._id} index={index}>
              <RunListItem
                report={report}
                isActive={report._id === activeId}
                onClick={() => setSelectedId(report._id)}
              />
            </ListEnter>
          ))}
        </>
      }
      detail={
        activeReport ? (
          <ReportCard
            report={activeReport}
            streamingActivity={
              activeReport.status === "running" ||
              activeReport.fixStatus === "fixing"
                ? streamingActivity
                : undefined
            }
          />
        ) : null
      }
    />
  );
}
