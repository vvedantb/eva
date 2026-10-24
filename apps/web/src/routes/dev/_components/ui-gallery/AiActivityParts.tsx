import {
  Button,
  Plan,
  PlanAction,
  PlanContent,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
  Test,
  TestDuration,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestName,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestStatusIndicator,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
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
      <Trace>
        <TraceLine>
          <TraceIcon>
            <IconFileSearch />
          </TraceIcon>
          <TraceTitle>Read trace.tsx</TraceTitle>
          <TraceDescription>2s</TraceDescription>
        </TraceLine>
        <TraceLine status="running">
          <TraceIcon>
            <IconTerminal2 />
          </TraceIcon>
          <TraceTitle shimmer>Running pnpm test</TraceTitle>
        </TraceLine>
        <TraceLine status="error">
          <TraceIcon>
            <IconTerminal2 />
          </TraceIcon>
          <TraceTitle>pnpm tsc --noEmit</TraceTitle>
          <TraceDescription>exit 2</TraceDescription>
        </TraceLine>
        <TraceLine status="pending">
          <TraceIcon>
            <IconTerminal2 />
          </TraceIcon>
          <TraceTitle>Install dependencies</TraceTitle>
        </TraceLine>
        <TraceCollapsible open onOpenChange={noop}>
          <TraceCollapsibleTrigger>
            <TraceLine>
              <TraceIcon>
                <IconBrain />
              </TraceIcon>
              <TraceTitle>Thought</TraceTitle>
              <TraceDescription>12s</TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            Two callers render the old Reasoning fold. Both move to Trace.
          </TraceCollapsibleContent>
        </TraceCollapsible>
        <TraceCollapsible open={false} onOpenChange={noop}>
          <TraceCollapsibleTrigger trailing={<span>3 files</span>}>
            <TraceLine>
              <TraceIcon>
                <IconBrain />
              </TraceIcon>
              <TraceTitle>Thought (closed, trailing)</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>Hidden body.</TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
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
      <Plan open onOpenChange={noop}>
        <PlanHeader>
          <PlanTitle>Move activity UI to Trace</PlanTitle>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>
          <ol className="list-decimal space-y-1 pl-4 text-sm">
            <li>Read the activity code.</li>
            <li>Replace the Reasoning fold.</li>
            <li>Run the type check.</li>
          </ol>
        </PlanContent>
        <PlanFooter>
          <Button size="sm">Build</Button>
        </PlanFooter>
      </Plan>
      <Plan isStreaming open={false} onOpenChange={noop}>
        <PlanHeader>
          <PlanTitle>Drafting plan</PlanTitle>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>Hidden.</PlanContent>
      </Plan>
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
              <Test name="renders a line" status="passed" duration={12} />
              <Test name="opens the fold" status="failed" duration={48}>
                <TestStatusIndicator />
                <TestName />
                <TestDuration />
                <TestError>
                  <TestErrorMessage>Expected open to be true</TestErrorMessage>
                  <TestErrorStack>
                    {"at trace.test.tsx:42:7\nat runTest (vitest.js:10:3)"}
                  </TestErrorStack>
                </TestError>
              </Test>
              <Test name="skips on CI" status="skipped" />
              <Test name="streams" status="running" />
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
              <Test name="hidden" status="passed" />
            </TestSuiteContent>
          </TestSuite>
        </TestResultsContent>
      </TestResults>
    </GalleryItem>
  );
}
