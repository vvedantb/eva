import {
  Button,
  AgentPlan,
  AgentPlanAction,
  AgentPlanContent,
  AgentPlanFooter,
  AgentPlanHeader,
  AgentPlanTitle,
  AgentPlanTrigger,
  TestResult,
  TestResultDuration,
  TestResultError,
  TestResultErrorMessage,
  TestResultErrorStack,
  TestResultName,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestResultStatusIndicator,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
  AgentTrace,
  AgentTraceCollapsible,
  AgentTraceCollapsibleContent,
  AgentTraceCollapsibleTrigger,
  AgentTraceDescription,
  AgentTraceIcon,
  AgentTraceLine,
  AgentTraceTitle,
  WebPreview,
  WebPreviewBody,
  WebPreviewConsole,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@vvedantb/ui";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBrain,
  IconFileSearch,
  IconRefresh,
  IconTerminal2,
} from "@tabler/icons-react";
import { GalleryItem } from "./GalleryItem";
import { CONSOLE_LOGS, PREVIEW_SRC_DOC } from "./aiActivityFixtures";

const noop = () => {};

export function TraceSpecimens() {
  return (
    <GalleryItem
      label="Trace (line / running / error / pending / collapsible open + closed)"
      className="w-96"
    >
      <AgentTrace>
        <AgentTraceLine>
          <AgentTraceIcon>
            <IconFileSearch />
          </AgentTraceIcon>
          <AgentTraceTitle>Read trace.tsx</AgentTraceTitle>
          <AgentTraceDescription>2s</AgentTraceDescription>
        </AgentTraceLine>
        <AgentTraceLine status="running">
          <AgentTraceIcon>
            <IconTerminal2 />
          </AgentTraceIcon>
          <AgentTraceTitle shimmer>Running pnpm test</AgentTraceTitle>
        </AgentTraceLine>
        <AgentTraceLine status="error">
          <AgentTraceIcon>
            <IconTerminal2 />
          </AgentTraceIcon>
          <AgentTraceTitle>pnpm tsc --noEmit</AgentTraceTitle>
          <AgentTraceDescription>exit 2</AgentTraceDescription>
        </AgentTraceLine>
        <AgentTraceLine status="pending">
          <AgentTraceIcon>
            <IconTerminal2 />
          </AgentTraceIcon>
          <AgentTraceTitle>Install dependencies</AgentTraceTitle>
        </AgentTraceLine>
        <AgentTraceCollapsible open onOpenChange={noop}>
          <AgentTraceCollapsibleTrigger>
            <AgentTraceLine>
              <AgentTraceIcon>
                <IconBrain />
              </AgentTraceIcon>
              <AgentTraceTitle>Thought</AgentTraceTitle>
              <AgentTraceDescription>12s</AgentTraceDescription>
            </AgentTraceLine>
          </AgentTraceCollapsibleTrigger>
          <AgentTraceCollapsibleContent>
            Two callers render the old Reasoning fold. Both move to Trace.
          </AgentTraceCollapsibleContent>
        </AgentTraceCollapsible>
        <AgentTraceCollapsible open={false} onOpenChange={noop}>
          <AgentTraceCollapsibleTrigger trailing={<span>3 files</span>}>
            <AgentTraceLine>
              <AgentTraceIcon>
                <IconBrain />
              </AgentTraceIcon>
              <AgentTraceTitle>Thought (closed, trailing)</AgentTraceTitle>
            </AgentTraceLine>
          </AgentTraceCollapsibleTrigger>
          <AgentTraceCollapsibleContent>
            Hidden body.
          </AgentTraceCollapsibleContent>
        </AgentTraceCollapsible>
      </AgentTrace>
    </GalleryItem>
  );
}

export function WebPreviewSpecimen() {
  return (
    <GalleryItem
      label="WebPreview (srcDoc body, console with fixed logs)"
      className="w-[560px]"
    >
      <WebPreview defaultUrl="https://example.com/dashboard" className="h-96">
        <WebPreviewNavigation>
          <WebPreviewNavigationButton tooltip="Back" disabled>
            <IconArrowLeft className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Forward" disabled>
            <IconArrowRight className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Reload">
            <IconRefresh className="size-4" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl readOnly />
        </WebPreviewNavigation>
        <WebPreviewBody src="about:blank" srcDoc={PREVIEW_SRC_DOC} />
        <WebPreviewConsole logs={CONSOLE_LOGS} />
      </WebPreview>
    </GalleryItem>
  );
}

export function PlanSpecimen() {
  return (
    <GalleryItem
      label="Plan (open) + Plan (streaming, closed)"
      className="w-96"
    >
      <AgentPlan open onOpenChange={noop}>
        <AgentPlanHeader>
          <AgentPlanTitle>Move activity UI to Trace</AgentPlanTitle>
          <AgentPlanAction>
            <AgentPlanTrigger />
          </AgentPlanAction>
        </AgentPlanHeader>
        <AgentPlanContent>
          <ol className="list-decimal space-y-1 pl-4 text-sm">
            <li>Read the activity code.</li>
            <li>Replace the Reasoning fold.</li>
            <li>Run the type check.</li>
          </ol>
        </AgentPlanContent>
        <AgentPlanFooter>
          <Button size="sm">Build</Button>
        </AgentPlanFooter>
      </AgentPlan>
      <AgentPlan isStreaming open={false} onOpenChange={noop}>
        <AgentPlanHeader>
          <AgentPlanTitle>Drafting plan</AgentPlanTitle>
          <AgentPlanAction>
            <AgentPlanTrigger />
          </AgentPlanAction>
        </AgentPlanHeader>
        <AgentPlanContent>Hidden.</AgentPlanContent>
      </AgentPlan>
    </GalleryItem>
  );
}

export function TestResultsSpecimen() {
  return (
    <GalleryItem label="TestResults (all parts)" className="w-[480px]">
      <TestResults
        summary={{
          passed: 8,
          failed: 1,
          skipped: 1,
          total: 10,
          duration: 3420,
        }}
      >
        <TestResultsHeader>
          <TestResultsSummary />
          <TestResultsDuration />
        </TestResultsHeader>
        <div className="px-4 pb-3">
          <TestResultsProgress />
        </div>
        <TestResultsContent>
          <TestSuite
            name="trace.test.tsx"
            status="failed"
            open
            onOpenChange={noop}
          >
            <TestSuiteName />
            <TestSuiteStats passed={2} failed={1} skipped={1} />
            <TestSuiteContent>
              <TestResult name="renders a line" status="passed" duration={12} />
              <TestResult name="opens the fold" status="failed" duration={48}>
                <TestResultStatusIndicator />
                <TestResultName />
                <TestResultDuration />
                <TestResultError>
                  <TestResultErrorMessage>
                    Expected open to be true
                  </TestResultErrorMessage>
                  <TestResultErrorStack>
                    {"at trace.test.tsx:42:7\nat runTest (vitest.js:10:3)"}
                  </TestResultErrorStack>
                </TestResultError>
              </TestResult>
              <TestResult name="skips on CI" status="skipped" />
              <TestResult name="streams" status="running" />
            </TestSuiteContent>
          </TestSuite>
          <TestSuite
            name="plan.test.tsx"
            status="passed"
            open={false}
            onOpenChange={noop}
          >
            <TestSuiteName />
            <TestSuiteStats passed={6} />
            <TestSuiteContent>
              <TestResult name="hidden" status="passed" />
            </TestSuiteContent>
          </TestSuite>
        </TestResultsContent>
      </TestResults>
    </GalleryItem>
  );
}
