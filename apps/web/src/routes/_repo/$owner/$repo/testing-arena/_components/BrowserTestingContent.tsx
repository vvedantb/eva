import { useState } from "react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  ActivityTasks,
  Spinner,
  TestError,
  TestErrorMessage,
} from "@eva/ui";
import {
  IconAlertTriangle,
  IconCheck,
  IconListCheck,
  IconX,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { ScenariosPanel } from "./ScenariosPanel";
import {
  ArenaListButton,
  ArenaListLabel,
  ArenaRunStatusRow,
  ArenaSplitPane,
} from "./ArenaSplitPane";

type EvaluationReport = FunctionReturnType<
  typeof api.evaluationReports.listByDoc
>[number];
type Scenario = FunctionReturnType<typeof api.arenaScenarios.listByDoc>[number];
type ArenaDoc = NonNullable<FunctionReturnType<typeof api.docs.getByNumId>>;

/** Selection key for the scenario editor; any other key is a report id. */
const SCENARIOS_KEY = "scenarios";

function runLabel(report: EvaluationReport) {
  return report.trigger === "pr" && report.prNumber !== undefined
    ? `PR #${report.prNumber}`
    : "Manual run";
}

function BrowserReportCard({
  report,
  streamingActivity,
}: {
  report: EvaluationReport;
  streamingActivity?: string;
}) {
  if (report.status === "pending" || report.status === "running") {
    const steps = parseActivitySteps(streamingActivity);
    return steps ? (
      <div className="px-1 py-3">
        <ActivityTasks steps={steps} isStreaming />
      </div>
    ) : (
      <div className="flex items-center gap-3 px-1 py-3">
        <Spinner size="sm" />
        <span className="text-sm text-muted-foreground truncate">
          {streamingActivity || "Starting the app and running scenarios..."}
        </span>
      </div>
    );
  }

  if (report.status === "error") {
    return (
      <TestError>
        <TestErrorMessage>{report.error ?? "The run failed"}</TestErrorMessage>
      </TestError>
    );
  }

  const results = report.scenarioResults ?? [];
  const failed = results.filter((r) => !r.passed).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium tabular-nums">
          {failed === 0
            ? `All ${results.length} passed`
            : `${failed} of ${results.length} failed`}
        </span>
        <span className="text-sm text-muted-foreground">
          {runLabel(report)}
          {report.headSha ? ` · ${report.headSha.slice(0, 7)}` : ""}
          {" · "}
          <RelativeDateTime at={report.createdAt} />
        </span>
      </div>

      {report.summary ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {report.summary}
        </p>
      ) : null}

      <div className="space-y-2">
        {results.map((result, index) => (
          <ListEnter key={result.scenarioId} index={index} fast>
            <div className="rounded-surface bg-muted/40 px-3 py-2.5">
              <div className="flex items-start gap-2">
                {result.passed ? (
                  <IconCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-success"
                    aria-label="Passed"
                  />
                ) : (
                  <IconX
                    size={16}
                    className="mt-0.5 shrink-0 text-destructive"
                    aria-label="Failed"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium">{result.title}</p>
                  {result.notes ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {result.notes}
                    </p>
                  ) : null}
                  {result.screenshotUrl ? (
                    <a
                      href={result.screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-fit"
                    >
                      <img
                        src={result.screenshotUrl}
                        alt={`Final screen for ${result.title}`}
                        loading="lazy"
                        className="max-h-48 rounded-md outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                      />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </ListEnter>
        ))}
      </div>
    </div>
  );
}

function BrowserRunListItem({
  report,
  isActive,
  onClick,
}: {
  report: EvaluationReport;
  isActive: boolean;
  onClick: () => void;
}) {
  const results = report.scenarioResults ?? [];
  const failed = results.filter((r) => !r.passed).length;

  return (
    <ArenaListButton isActive={isActive} onClick={onClick}>
      {report.status === "completed" ? (
        <>
          {failed === 0 ? (
            <IconCheck size={14} className="text-success shrink-0" />
          ) : (
            <IconAlertTriangle
              size={14}
              className="text-destructive shrink-0"
            />
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm tabular-nums">
              {failed === 0 ? "Passed" : `${failed} failed`}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {runLabel(report)} · <RelativeDateTime at={report.createdAt} />
            </span>
          </div>
        </>
      ) : null}
      <ArenaRunStatusRow status={report.status} createdAt={report.createdAt} />
    </ArenaListButton>
  );
}

/**
 * Browser tab: the stored scenarios (editor) pinned above the run list, and
 * the selected run's per-scenario pass/fail with screenshots.
 */
export function BrowserTestingContent({
  doc,
  scenarios,
  reports,
  streamingActivity,
}: {
  doc: ArenaDoc;
  scenarios: Scenario[] | undefined;
  reports: EvaluationReport[] | undefined;
  streamingActivity?: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // With no explicit pick: follow a live run, else open the scenario editor.
  const activeKey =
    selectedKey ??
    reports?.find((r) => r.status === "running")?._id ??
    SCENARIOS_KEY;
  const activeReport = reports?.find((r) => r._id === activeKey);

  if (reports === undefined) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner />
      </div>
    );
  }

  return (
    <ArenaSplitPane
      detailKey={activeReport?._id ?? SCENARIOS_KEY}
      list={
        <>
          <ArenaListButton
            isActive={activeReport === undefined}
            onClick={() => setSelectedKey(SCENARIOS_KEY)}
          >
            <IconListCheck size={14} className="shrink-0" />
            <span className="text-sm">
              Scenarios
              {scenarios !== undefined ? (
                <span className="text-muted-foreground tabular-nums">
                  {` (${scenarios.length})`}
                </span>
              ) : null}
            </span>
          </ArenaListButton>
          {reports.length > 0 ? (
            <ArenaListLabel>Test runs ({reports.length})</ArenaListLabel>
          ) : null}
          {reports.map((report, index) => (
            <ListEnter key={report._id} index={index}>
              <BrowserRunListItem
                report={report}
                isActive={report._id === activeReport?._id}
                onClick={() => setSelectedKey(report._id)}
              />
            </ListEnter>
          ))}
        </>
      }
      detail={
        activeReport ? (
          <BrowserReportCard
            report={activeReport}
            streamingActivity={
              activeReport.status === "running" ? streamingActivity : undefined
            }
          />
        ) : (
          <ScenariosPanel
            docId={doc._id}
            prRunsEnabled={doc.arenaPrRunsUserId !== undefined}
            scenarios={scenarios}
          />
        )
      }
    />
  );
}
