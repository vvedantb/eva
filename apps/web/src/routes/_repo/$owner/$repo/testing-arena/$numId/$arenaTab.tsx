import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryState } from "nuqs";
import { branchParser } from "@/lib/search-params";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useDocByNumId } from "@/lib/useResolveByNumId";
import { EntityNumIdGate } from "@/lib/components/EntityNumIdGate";
import type { FunctionReturnType } from "convex/server";
import {
  ActivityTasks,
  Button,
  Spinner,
  TestError,
  TestErrorMessage,
} from "@eva/ui";
import {
  IconPlayerPlay,
  IconCheck,
  IconAlertTriangle,
  IconGitPullRequest,
  IconTool,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { IssuesList } from "../_components/IssuesList";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { BranchSelect } from "@/lib/components/BranchSelect";

export const Route = createFileRoute(
  "/_repo/$owner/$repo/testing-arena/$numId/$arenaTab",
)({
  component: TestingArenaDetailRoute,
});

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
      <TestError>
        <TestErrorMessage>{report.error}</TestErrorMessage>
      </TestError>
    );
  }

  if (report.status !== "completed") return null;

  return (
    <div className="space-y-3">
      <div className="flex max-sm:flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {issues.length === 0
            ? "No issues found"
            : `${issues.length} issue${issues.length === 1 ? "" : "s"} found`}
        </span>
        <div className="flex max-sm:flex-wrap items-center gap-2">
          {issues.length > 0 && report.fixStatus === undefined && (
            <Button size="sm" onClick={handleFix} disabled={isStartingFix}>
              <IconTool size={14} />
              {isStartingFix ? "Starting..." : "Fix issues"}
            </Button>
          )}
          {report.fixStatus === "fixing" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner size="sm" />
              Fixing issues...
            </span>
          )}
          {report.fixStatus === "fix_error" && (
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
          )}
          {report.prUrl && (
            <a
              href={report.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-sm:hit-target inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <IconGitPullRequest size={14} aria-hidden />
              View Fix PR
            </a>
          )}
          <RelativeDateTime
            at={report.createdAt}
            className="text-sm text-muted-foreground"
          />
        </div>
      </div>

      {report.fixStatus === "fixing" &&
        (() => {
          const fixSteps = parseActivitySteps(streamingActivity);
          return fixSteps ? (
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
          );
        })()}

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
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 ${
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-transparent hover:bg-muted/50"
      }`}
    >
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
      {report.status === "error" && (
        <>
          <IconAlertTriangle size={14} className="text-destructive shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-destructive">Error</span>
            <RelativeDateTime
              at={report.createdAt}
              className="text-xs text-muted-foreground"
            />
          </div>
        </>
      )}
      {report.status === "running" && (
        <>
          <Spinner size="sm" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-muted-foreground">Running...</span>
            <RelativeDateTime
              at={report.createdAt}
              className="text-xs text-muted-foreground"
            />
          </div>
        </>
      )}
    </button>
  );
}

function CodeTestingContent({
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
    <div className="h-full flex flex-col overflow-hidden sm:flex-row">
      <div className="w-full shrink-0 border-b overflow-y-auto scrollbar p-2 space-y-1 max-h-32 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
        <p className="text-xs font-medium text-muted-foreground px-2 py-1">
          Test runs ({reports.length})
        </p>
        {reports.map((report) => (
          <RunListItem
            key={report._id}
            report={report}
            isActive={report._id === activeId}
            onClick={() => setSelectedId(report._id)}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar p-4">
        {activeReport && (
          <ReportCard
            report={activeReport}
            streamingActivity={
              activeReport.status === "running" ||
              activeReport.fixStatus === "fixing"
                ? streamingActivity
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

/** Non-null doc shape the detail body works with, once the gate has resolved it. */
type ArenaDoc = NonNullable<FunctionReturnType<typeof api.docs.getByNumId>>;

function TestingArenaDetailRoute() {
  const { numId } = Route.useParams();
  const { basePath, repoId } = useRepo();
  const resolve = useDocByNumId(numId, repoId);

  return (
    <EntityNumIdGate
      resolve={resolve}
      entityLabel="document"
      backTo={`${basePath}/testing-arena`}
    >
      {(doc) => <TestingArenaDetail doc={doc} />}
    </EntityNumIdGate>
  );
}

function TestingArenaDetail({ doc }: { doc: ArenaDoc }) {
  const { repo } = useRepo();
  const reports = useQuery(api.evaluationReports.listByDoc, {
    docId: doc._id,
  });
  const activeReport = reports?.find(
    (r) => r.status === "running" || r.fixStatus === "fixing",
  );
  const streaming = useQuery(
    api.streaming.get,
    activeReport ? { entityId: activeReport._id } : "skip",
  );
  const startEvaluation = useMutation(api.evaluationWorkflow.startEvaluation);
  const [isRunning, setIsRunning] = useState(false);
  const [branch, setBranch] = useQueryState("branch", branchParser);

  const hasActiveRun =
    reports?.some((r) => r.status === "pending" || r.status === "running") ??
    false;
  const hasContent = (doc.content?.trim().length ?? 0) > 0;

  const handleRunTest = async () => {
    setIsRunning(true);
    // Resolved before the try: React Compiler bails on the whole file when a
    // conditional expression sits inside a try/catch.
    const branchName = branch !== "main" ? branch : undefined;
    try {
      await startEvaluation({
        docId: doc._id,
        repoId: repo._id,
        branchName,
      });
    } catch (error) {
      setIsRunning(false);
      throw error;
    }
    setIsRunning(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-4">
        <h1 className="min-w-0 truncate text-sm font-medium">{doc.title}</h1>
        <div className="flex items-center gap-2">
          <BranchSelect
            value={branch}
            onValueChange={setBranch}
            // `shrink-0` + a wider floor below `sm`: as a flex child next to
            // "Run Test" it otherwise shrank until the branch read as one letter.
            className="h-7 w-24 text-xs max-sm:h-10 max-sm:w-32 max-sm:shrink-0 sm:w-36"
          />
          <Button
            size="sm"
            onClick={handleRunTest}
            disabled={isRunning || hasActiveRun || !hasContent}
            title={
              !hasContent
                ? "Add content to this document to run tests"
                : undefined
            }
          >
            <IconPlayerPlay size={16} />
            {isRunning || hasActiveRun ? "Running..." : "Run Test"}
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeTestingContent
          reports={reports}
          streamingActivity={streaming?.currentActivity}
        />
      </div>
    </div>
  );
}
