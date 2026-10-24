// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import * as Next from "@vvedantb/ui";
import { evaUiConfig } from "../config";
import * as LegacyTrace from "../__legacy__/ai-elements/trace";
import * as LegacyShared from "../__legacy__/ai-elements/activity-shared";
import { ActivityTasks as LegacyActivityTasks, OpenSubagentContext as LegacyOpenSubagentContext } from "../__legacy__/ai-elements/activity-tasks";
import { ActivityQuestionCard as LegacyActivityQuestionCard } from "../__legacy__/ai-elements/activity-question";
import * as LegacyWebPreview from "../__legacy__/ai-elements/web-preview";
import * as LegacyContext from "../__legacy__/ai-elements/context";
import * as LegacyPlan from "../__legacy__/ai-elements/plan";
import * as LegacyTestResults from "../__legacy__/ai-elements/test-results";
import * as LegacyModelPicker from "../__legacy__/ai-elements/model-picker";
import { ProviderIcon as LegacyProviderIcon } from "../__legacy__/ai-elements/provider-icon";
import type { ActivityStep } from "../__legacy__/ai-elements/activity-shared";
import { renderPair } from "./harness";

// happy-dom has no Web Animations API. Spinner and CircleSpinner start their
// loops with `element.animate()` in a ref callback; a no-op Animation lets both
// trees mount (the DOM is what is compared, not motion).
Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  value: () => ({ playState: "running", pause() {}, play() {}, cancel() {} }),
});

type Case = {
  name: string;
  legacy: ReactNode;
  next: ReactNode;
  interact?: () => Promise<void> | void;
  /** Applied to both serialisations; every use carries its reason. */
  normalise?: (html: string) => string;
  /** Text the vvedantb render must contain (guards against comparing two empty states). */
  expectText?: string;
};

/**
 * vvedantb's `TabsList` (WebPreviewConsole) adds `data-variant="segmented"`.
 * Same exception as the controls parity test: no eva CSS, test or script
 * selects `data-variant`, so dropping it hides no visible change.
 */
const stripTabsVariant = (html: string) => html.replaceAll(' data-variant="segmented"', "");

async function expectParity({ legacy, next, interact, normalise = (html) => html }: Case) {
  const pair = await renderPair(legacy, next, evaUiConfig, interact);
  expect(normalise(stripTabsVariant(pair.next))).toBe(normalise(pair.legacy));
  return pair;
}

function runCases(cases: Case[]) {
  for (const c of cases) {
    it(c.name, async () => {
      const { next } = await expectParity(c);
      expect(next.length).toBeGreaterThan(20);
      if (c.expectText) expect(next).toContain(c.expectText);
    });
  }
}

/** Clicks every closed fold, pass after pass, so nested folds open too. */
async function openAllFolds() {
  for (let pass = 0; pass < 4; pass++) {
    const closed = [...document.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')];
    if (closed.length === 0) return;
    for (const button of closed) button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// ---------------------------------------------------------------------------
// Trace

function traceTree(T: typeof LegacyTrace | typeof Next, open: boolean) {
  return (
    <T.Trace className="pt-1">
      <T.TraceLine>
        <T.TraceIcon>
          <svg />
        </T.TraceIcon>
        <T.TraceTitle>Plain line</T.TraceTitle>
        <T.TraceDescription>3s</T.TraceDescription>
      </T.TraceLine>
      {(["running", "error", "pending"] as const).map((status) => (
        <T.TraceLine key={status} status={status} className="extra">
          <T.TraceIcon iconKey={status}>
            <svg />
          </T.TraceIcon>
          <T.TraceTitle shimmer={status === "running"} title="full title" className="title-x">
            {status}
          </T.TraceTitle>
        </T.TraceLine>
      ))}
      <T.TraceCollapsible defaultOpen={open}>
        <T.TraceCollapsibleTrigger>
          <T.TraceLine>
            <T.TraceTitle>Fold</T.TraceTitle>
          </T.TraceLine>
        </T.TraceCollapsibleTrigger>
        <T.TraceCollapsibleContent className="flex flex-col gap-2">Body</T.TraceCollapsibleContent>
      </T.TraceCollapsible>
      <T.TraceCollapsible defaultOpen={open} className="c-x">
        <T.TraceCollapsibleTrigger trailing={<button type="button">chip</button>} className="t-x">
          <T.TraceLine status="error">
            <T.TraceTitle>With trailing</T.TraceTitle>
          </T.TraceLine>
        </T.TraceCollapsibleTrigger>
        <T.TraceCollapsibleContent>Body</T.TraceCollapsibleContent>
      </T.TraceCollapsible>
    </T.Trace>
  );
}

describe("Trace", () => {
  runCases([
    { name: "closed", legacy: traceTree(LegacyTrace, false), next: traceTree(Next, false) },
    { name: "open", legacy: traceTree(LegacyTrace, true), next: traceTree(Next, true) },
    {
      name: "trigger click opens",
      legacy: traceTree(LegacyTrace, false),
      next: traceTree(Next, false),
      interact: openAllFolds,
    },
  ]);
});

// ---------------------------------------------------------------------------
// ActivityTasks

const step = (partial: Partial<ActivityStep> & Pick<ActivityStep, "type" | "label">): ActivityStep => ({
  status: "complete",
  ...partial,
});

const workSteps: ActivityStep[] = [
  step({ type: "thinking", label: "Thought", detail: "Reading the **repo** first." }),
  step({ type: "read", label: "Read file", detail: "src/app.ts", path: "/repo/src/app.ts", toolUseId: "t1", durationMs: 1200 }),
  step({
    type: "bash",
    label: "Ran command",
    detail: "git status",
    command: "git status",
    output: { text: "On branch main", exitCode: 0 },
    toolUseId: "t2",
  }),
  step({
    type: "bash",
    label: "Ran command",
    detail: "pnpm test",
    output: { text: "1 failed", exitCode: 1, truncated: true },
    isError: true,
    toolUseId: "t3",
  }),
  step({
    type: "edit",
    label: "Edited file",
    detail: "src/app.ts",
    path: "/repo/src/app.ts",
    edits: [{ oldText: "a", newText: "b" }],
    toolUseId: "t4",
  }),
  step({ type: "write", label: "Created file", detail: "notes.md", contentPreview: "# Notes", toolUseId: "t5" }),
  step({ type: "tool", label: "Used tool", files: ["/repo/a.ts", "/repo/b/c.ts"], toolUseId: "t6" }),
  step({ type: "response", label: "Response", detail: "Halfway there." }),
  step({
    type: "todos",
    label: "Task list",
    todos: [
      { content: "Done thing", status: "completed" },
      { content: "Doing thing", status: "in_progress" },
      { content: "Next thing", status: "pending" },
    ],
  }),
  step({ type: "subtask", label: "Ran agent", detail: "Explore", toolUseId: "sub1" }),
  step({ type: "search_code", label: "Searched code", detail: "useCn", parentToolUseId: "sub1", toolUseId: "c1" }),
  step({ type: "web_fetch", label: "Fetched URL", detail: "https://example.com", parentToolUseId: "sub1", toolUseId: "c2" }),
  step({ type: "response", label: "Response", detail: "child text", parentToolUseId: "sub1" }),
  step({ type: "notice", label: "Notice", detail: "Context compacted" }),
  step({ type: "question", label: "Asked a question" }),
  step({ type: "steer", label: "Steered", detail: "also fix the tests" }),
  step({ type: "web_search", label: "Web search", detail: "tailwind merge", hasHiddenDetail: true, toolUseId: "t7" }),
];

const activeSteps: ActivityStep[] = [
  step({ type: "thinking", label: "Thought", detail: "Planning", status: "active" }),
  step({ type: "read", label: "Read file", detail: "src/app.ts", toolUseId: "a1" }),
  step({ type: "bash", label: "Running command", detail: "ls -la", status: "active", toolUseId: "a2" }),
  step({
    type: "todos",
    label: "Task list",
    status: "active",
    todos: [{ content: "One", status: "in_progress" }],
  }),
  step({ type: "status", label: "Starting sandbox", status: "pending" }),
];

const manySteps: ActivityStep[] = Array.from({ length: 12 }, (_, index) => [
  step({ type: "notice", label: `Notice ${index}`, detail: `n${index}` }),
]).flat();

type TasksProps = {
  steps: ActivityStep[];
  isStreaming?: boolean;
  name?: string;
  duration?: string;
  layout?: "folded" | "inline";
  onOpenFile?: (path: string) => void;
  onRequestFullDetail?: () => void;
  className?: string;
};

const noop = () => {};

function tasksCases(label: string, props: TasksProps, openText?: string): Case[] {
  return [
    {
      name: label,
      legacy: <LegacyActivityTasks {...props} />,
      next: <Next.ActivityTasks {...props} />,
    },
    {
      name: `${label}, all folds open`,
      legacy: <LegacyActivityTasks {...props} />,
      next: <Next.ActivityTasks {...props} />,
      interact: openAllFolds,
      expectText: openText,
    },
  ];
}

describe("ActivityTasks", () => {
  runCases([
    ...tasksCases("settled, folded with duration", { steps: workSteps, duration: "4m 2s", onRequestFullDetail: noop }, "Exit code 1"),
    ...tasksCases("settled, folded, no duration", { steps: workSteps, className: "pt-1" }, "Exit code 1"),
    ...tasksCases("settled, inline", { steps: workSteps, layout: "inline", onOpenFile: noop }, "Loading output..."),
    ...tasksCases("settled, inline with duration", { steps: workSteps, layout: "inline", duration: "12s" }, "Truncated"),
    ...tasksCases("streaming with active steps", { steps: activeSteps, isStreaming: true, onOpenFile: noop }, "Planning"),
    ...tasksCases("overflow, settled", { steps: manySteps }),
    ...tasksCases("overflow, streaming", { steps: manySteps, isStreaming: true }),
    ...tasksCases("overflow, inline", { steps: manySteps, layout: "inline" }),
    {
      name: "overflow toggle expands",
      legacy: <LegacyActivityTasks steps={manySteps} />,
      next: <Next.ActivityTasks steps={manySteps} />,
      interact: () => {
        const toggle = [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Show"));
        toggle?.click();
      },
    },
    {
      name: "subtask with View link",
      legacy: (
        <LegacyOpenSubagentContext value={noop}>
          <LegacyActivityTasks steps={workSteps.slice(9, 13)} layout="inline" />
        </LegacyOpenSubagentContext>
      ),
      next: (
        <Next.OpenSubagentContext value={noop}>
          <Next.ActivityTasks steps={workSteps.slice(9, 13)} layout="inline" />
        </Next.OpenSubagentContext>
      ),
      interact: openAllFolds,
    },
    {
      name: "subtask with more than 8 children",
      legacy: (
        <LegacyActivityTasks
          layout="inline"
          steps={[
            step({ type: "subtask", label: "Ran agent", toolUseId: "s" }),
            ...Array.from({ length: 10 }, (_, index) =>
              step({ type: "read", label: "Read file", detail: `f${index}.ts`, parentToolUseId: "s", toolUseId: `r${index}` }),
            ),
          ]}
        />
      ),
      next: (
        <Next.ActivityTasks
          layout="inline"
          steps={[
            step({ type: "subtask", label: "Ran agent", toolUseId: "s" }),
            ...Array.from({ length: 10 }, (_, index) =>
              step({ type: "read", label: "Read file", detail: `f${index}.ts`, parentToolUseId: "s", toolUseId: `r${index}` }),
            ),
          ]}
        />
      ),
    },
    {
      name: "empty and not streaming renders nothing",
      legacy: (
        <div>
          <LegacyActivityTasks steps={[]} />
          empty
        </div>
      ),
      next: (
        <div>
          <Next.ActivityTasks steps={[]} />
          empty
        </div>
      ),
    },
  ]);

  // The header text carries a random verb; pinning `Math.random` keeps it equal.
  it("streaming header with no rows yet (default name)", async () => {
    const random = Math.random;
    Math.random = () => 0;
    try {
      const { next } = await expectParity({
        name: "header",
        legacy: <LegacyActivityTasks steps={[]} isStreaming startedAt={Date.now() - 5000} />,
        next: <Next.ActivityTasks steps={[]} isStreaming startedAt={Date.now() - 5000} />,
      });
      expect(next).toContain("Eva is accomplishing...");
    } finally {
      Math.random = random;
    }
  });

  it("streaming header with an explicit name and only a response", async () => {
    const random = Math.random;
    Math.random = () => 0.5;
    try {
      const steps = [step({ type: "response", label: "Response", detail: "", status: "active" })];
      const { next } = await expectParity({
        name: "header named",
        legacy: <LegacyActivityTasks steps={steps} isStreaming name="Claude" />,
        next: <Next.ActivityTasks steps={steps} isStreaming name="Claude" />,
      });
      expect(next).toContain("Claude is");
    } finally {
      Math.random = random;
    }
  });
});

describe("ActivityThinkingIcon", () => {
  runCases([
    {
      name: "eva mark (EvaThinkingIcon)",
      legacy: <LegacyShared.EvaThinkingIcon className="size-4" />,
      next: <Next.ActivityThinkingIcon className="size-4" />,
    },
  ]);
});

// ---------------------------------------------------------------------------
// ActivityQuestionCard

const questions = [
  {
    question: "Which database?",
    header: "DB",
    options: [{ label: "Postgres", description: "Relational" }, { label: "Mongo" }],
  },
  {
    question: "Which features?",
    multiSelect: true,
    options: [{ label: "Auth" }, { label: "Billing" }, { label: "Search" }],
  },
  { question: "Anything else?", options: [{ label: "No" }] },
];

describe("ActivityQuestionCard", () => {
  const variants: [string, Record<string, string> | undefined][] = [
    ["unanswered", undefined],
    ["answered with picks and free text", { "Which database?": "Postgres", "Which features?": "Auth, Search", "Anything else?": "Add docs" }],
    ["blank answer", { "Which database?": " " }],
  ];
  runCases([
    ...variants.map(([name, answers]) => ({
      name,
      legacy: <LegacyActivityQuestionCard questions={questions} answers={answers} />,
      next: <Next.ActivityQuestionCard questions={questions} answers={answers} />,
    })),
    {
      name: "single question",
      legacy: <LegacyActivityQuestionCard questions={questions.slice(0, 1)} answers={{ "Which database?": "Mongo" }} />,
      next: <Next.ActivityQuestionCard questions={questions.slice(0, 1)} answers={{ "Which database?": "Mongo" }} />,
    },
  ]);
});

// ---------------------------------------------------------------------------
// WebPreview

const logs = [
  { level: "log" as const, message: "ready", timestamp: new Date(2026, 0, 1, 10, 0, 0) },
  { level: "warn" as const, message: "slow", timestamp: new Date(2026, 0, 1, 10, 0, 1) },
  { level: "error" as const, message: "boom", timestamp: new Date(2026, 0, 1, 10, 0, 2) },
];

function webPreviewTree(W: typeof LegacyWebPreview | typeof Next, variant: "full" | "panel") {
  if (variant === "panel") {
    return (
      <W.WebPreview defaultUrl="http://localhost:5173" className="h-full rounded-none border-0">
        <W.WebPreviewNavigation className="gap-2">
          <W.WebPreviewNavigationButton tooltip="Reload" disabled>
            <svg />
          </W.WebPreviewNavigationButton>
          <W.WebPreviewUrl />
        </W.WebPreviewNavigation>
        <W.WebPreviewBody src="http://example.com/x" loading={<div>loading</div>} />
      </W.WebPreview>
    );
  }
  return (
    <W.WebPreview defaultUrl="https://example.com">
      <W.WebPreviewNavigation>
        <W.WebPreviewNavigationButton tooltip="Back">
          <svg />
        </W.WebPreviewNavigationButton>
        <W.WebPreviewUrl placeholder="Go to..." />
      </W.WebPreviewNavigation>
      <W.WebPreviewBody />
      <W.WebPreviewConsole logs={logs}>
        <span>extra</span>
      </W.WebPreviewConsole>
      <W.WebPreviewConsole terminal={<div>term</div>} className="c" />
      <W.WebPreviewConsole />
    </W.WebPreview>
  );
}

describe("WebPreview", () => {
  runCases([
    { name: "full tree", legacy: webPreviewTree(LegacyWebPreview, "full"), next: webPreviewTree(Next, "full") },
    { name: "panel (rounded-none, border-0)", legacy: webPreviewTree(LegacyWebPreview, "panel"), next: webPreviewTree(Next, "panel") },
    {
      name: "console tab switch",
      legacy: webPreviewTree(LegacyWebPreview, "full"),
      next: webPreviewTree(Next, "full"),
      interact: () => {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === "Console");
        tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      },
    },
  ]);
});

// ---------------------------------------------------------------------------
// Context

const usage = { inputTokens: 12000, outputTokens: 3400, cachedInputReadTokens: 50000, cachedInputWriteTokens: 0 };
const costs = { totalUSD: 0.1234, inputUSD: 0.03, outputUSD: 0.05, cacheReadUSD: 0.0043 };

function contextTree(C: typeof LegacyContext | typeof Next, open: boolean, custom: boolean) {
  return (
    <C.Context {...(open ? { open: true } : {})} usedTokens={65400} maxTokens={200000} usage={usage} costs={costs}>
      {custom ? (
        <C.ContextTrigger>
          <button type="button">—</button>
        </C.ContextTrigger>
      ) : (
        <C.ContextTrigger data-testid="context-meter" className="text-destructive" />
      )}
      <C.ContextContent data-testid="context-meter-popover">
        {custom ? (
          <C.ContextContentHeader>
            <p>custom</p>
          </C.ContextContentHeader>
        ) : (
          <C.ContextContentHeader />
        )}
        <C.ContextContentBody className="space-y-1">
          <C.ContextInputUsage />
          <C.ContextOutputUsage />
          <C.ContextCacheReadUsage />
          <C.ContextCacheWriteUsage />
          <C.ContextCacheUsage />
        </C.ContextContentBody>
        <C.ContextContentFooter />
      </C.ContextContent>
    </C.Context>
  );
}

describe("Context", () => {
  runCases([
    { name: "closed trigger", legacy: contextTree(LegacyContext, false, false), next: contextTree(Next, false, false) },
    { name: "open", legacy: contextTree(LegacyContext, true, false), next: contextTree(Next, true, false) },
    { name: "open, custom trigger and header", legacy: contextTree(LegacyContext, true, true), next: contextTree(Next, true, true) },
    {
      name: "open, no costs",
      legacy: (
        <LegacyContext.Context open usedTokens={10} maxTokens={0}>
          <LegacyContext.ContextTrigger />
          <LegacyContext.ContextContent>
            <LegacyContext.ContextContentHeader />
            <LegacyContext.ContextContentFooter />
          </LegacyContext.ContextContent>
        </LegacyContext.Context>
      ),
      next: (
        <Next.Context open usedTokens={10} maxTokens={0}>
          <Next.ContextTrigger />
          <Next.ContextContent>
            <Next.ContextContentHeader />
            <Next.ContextContentFooter />
          </Next.ContextContent>
        </Next.Context>
      ),
    },
  ]);
});

// ---------------------------------------------------------------------------
// Plan

function planTree(P: typeof LegacyPlan | typeof Next, isStreaming: boolean, open: boolean) {
  return (
    <P.Plan isStreaming={isStreaming} defaultOpen={open} className="p-x">
      <P.PlanHeader className="h-x">
        <div>
          <P.PlanTitle>Refactor the store</P.PlanTitle>
        </div>
        <P.PlanAction>
          <P.PlanTrigger />
        </P.PlanAction>
      </P.PlanHeader>
      <P.PlanContent>Step one</P.PlanContent>
      <P.PlanFooter>Footer</P.PlanFooter>
    </P.Plan>
  );
}

describe("Plan", () => {
  runCases([
    { name: "closed", legacy: planTree(LegacyPlan, false, false), next: planTree(Next, false, false) },
    { name: "open", legacy: planTree(LegacyPlan, false, true), next: planTree(Next, false, true) },
    { name: "streaming", legacy: planTree(LegacyPlan, true, true), next: planTree(Next, true, true) },
    {
      name: "trigger toggles",
      legacy: planTree(LegacyPlan, false, false),
      next: planTree(Next, false, false),
      interact: openAllFolds,
    },
  ]);
});

// ---------------------------------------------------------------------------
// TestResults

const summary = { passed: 8, failed: 1, skipped: 2, total: 11, duration: 1530 };

function testResultsTree(T: typeof LegacyTestResults | typeof Next, open: boolean) {
  return (
    <T.TestResults summary={summary}>
      <T.TestResultsHeader>
        <T.TestResultsSummary />
        <T.TestResultsDuration />
      </T.TestResultsHeader>
      <T.TestResultsContent>
        <T.TestResultsProgress />
        {(["passed", "failed", "skipped", "running"] as const).map((status) => (
          <T.TestSuite key={status} name={`suite ${status}`} status={status} defaultOpen={open}>
            <T.TestSuiteName>
              <T.TestSuiteStats passed={2} failed={1} skipped={1} />
            </T.TestSuiteName>
            <T.TestSuiteContent>
              <T.Test name="adds" status={status} duration={12} />
              <T.Test name="custom" status={status}>
                <T.TestStatusIndicator />
                <T.TestName />
                <T.TestDuration />
              </T.Test>
              <T.TestError>
                <T.TestErrorMessage>Expected 1</T.TestErrorMessage>
                <T.TestErrorStack>at x.ts:1</T.TestErrorStack>
              </T.TestError>
            </T.TestSuiteContent>
          </T.TestSuite>
        ))}
      </T.TestResultsContent>
    </T.TestResults>
  );
}

describe("TestResults", () => {
  runCases([
    { name: "closed suites", legacy: testResultsTree(LegacyTestResults, false), next: testResultsTree(Next, false) },
    { name: "open suites", legacy: testResultsTree(LegacyTestResults, true), next: testResultsTree(Next, true) },
    {
      name: "default header from summary",
      legacy: <LegacyTestResults.TestResults summary={{ passed: 3, failed: 0, skipped: 0, total: 3 }} className="x" />,
      next: <Next.TestResults summary={{ passed: 3, failed: 0, skipped: 0, total: 3 }} className="x" />,
    },
  ]);
});

// ---------------------------------------------------------------------------
// Model picker

type Model = "opus" | "sonnet" | "haiku" | "gpt-5" | "cursor-1";
const options: { id: Model; provider: string; label: string }[] = [
  { id: "opus", provider: "claude", label: "Opus" },
  { id: "sonnet", provider: "claude", label: "Sonnet" },
  { id: "haiku", provider: "claude", label: "Claude Haiku" },
  { id: "gpt-5", provider: "codex", label: "GPT-5" },
  { id: "cursor-1", provider: "cursor", label: "Composer" },
];
const accounts = [
  { id: "acc-1", provider: "claude", label: "jane_doe", isOwn: true },
  { id: "acc-2", provider: "codex", label: "Team Mate", isOwn: false },
];

type SelectProps = {
  value: Model;
  accountId?: string | null;
  withAccounts?: boolean;
  triggerSuffix?: string;
  showFastIcon?: boolean;
  disabled?: boolean;
  header?: ReactNode;
  simpleLadder?: Model[];
  canSelectTeamWhilePersonal?: boolean;
  className?: string;
};

function selectNode(M: typeof LegacyModelPicker | typeof Next, props: SelectProps) {
  const { withAccounts, ...rest } = props;
  return <M.ModelSelect {...rest} options={options} onValueChange={noop} accounts={withAccounts ? accounts : undefined} />;
}

/**
 * vvedantb's `Slider` puts `aria-label` / `aria-valuetext` on the thumb (the
 * focusable role="slider" element) where eva left them on the role-less root.
 * Same exception as the controls parity test: only the attribute's element
 * moves, and screen readers now get the name. Dropped on both sides.
 */
const stripSliderLabel = (html: string) => html.replace(/ aria-label="Model"| aria-valuetext="[^"]*"/g, "");

function selectCase(name: string, props: SelectProps, open: boolean): Case {
  return {
    name,
    normalise: props.simpleLadder ? stripSliderLabel : undefined,
    expectText: open ? (props.simpleLadder ? "Advanced" : "Search models...") : undefined,
    legacy: selectNode(LegacyModelPicker, props),
    next: selectNode(Next, props),
    interact: open
      ? () => {
          document.querySelector<HTMLButtonElement>('button[role="combobox"]')?.click();
        }
      : undefined,
  };
}

describe("ModelSelect", () => {
  runCases([
    selectCase("closed, plain", { value: "opus" }, false),
    selectCase("closed, suffix + fast + className", { value: "gpt-5", triggerSuffix: "High", showFastIcon: true, className: "max-w-40" }, false),
    selectCase("closed, account badge", { value: "opus", withAccounts: true, accountId: "acc-1" }, false),
    selectCase("closed, disabled", { value: "sonnet", disabled: true }, false),
    selectCase("open, full picker", { value: "opus" }, true),
    selectCase("open, accounts + header", { value: "opus", withAccounts: true, accountId: "acc-1", header: <div>traits</div> }, true),
    selectCase(
      "open, team locked while personal",
      { value: "opus", withAccounts: true, accountId: "acc-1", canSelectTeamWhilePersonal: false },
      true,
    ),
    selectCase("open, simple ladder", { value: "sonnet", simpleLadder: ["haiku", "sonnet", "opus"] }, true),
  ]);
});

describe("ModelPickerContent", () => {
  runCases([
    {
      name: "embedded panel",
      legacy: (
        <LegacyModelPicker.ModelPickerContent value="gpt-5" accountId={null} options={options} accounts={accounts} onSelect={noop} />
      ),
      next: <Next.ModelPickerContent value="gpt-5" accountId={null} options={options} accounts={accounts} onSelect={noop} />,
    },
    {
      name: "search filters across instances",
      legacy: <LegacyModelPicker.ModelPickerContent value="opus" accountId="acc-1" options={options} accounts={accounts} onSelect={noop} />,
      next: <Next.ModelPickerContent value="opus" accountId="acc-1" options={options} accounts={accounts} onSelect={noop} />,
      interact: () => {
        const input = document.querySelector<HTMLInputElement>("input");
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "son");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
    },
  ]);

  it("surface class is unchanged", () => {
    expect(Next.modelPickerSurfaceClass).toBe(LegacyModelPicker.modelPickerSurfaceClass);
  });
});

describe("ProviderIcon", () => {
  runCases(
    ["claude", "codex", "opencode", "cursor", "other"].map((provider) => ({
      name: provider,
      legacy: <LegacyProviderIcon provider={provider} size={20} className="x" />,
      next: <Next.ProviderIcon provider={provider} size={20} className="x" />,
    })),
  );
});
