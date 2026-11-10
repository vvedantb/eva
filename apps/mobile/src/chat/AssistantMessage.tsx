import {
  hasStepDetail,
  parseTraceSegments,
  summariseToolSteps,
  type ToolStepType,
  type TraceStep,
} from "@eva/shared/activityTrace";
import {
  IconBook2,
  IconFilePlus,
  IconFileSearch,
  IconFileText,
  IconFolderSearch,
  IconPencil,
  IconSearch,
  IconSitemap,
  IconTerminal2,
  IconTool,
  IconWorld,
  type IconProps,
} from "@tabler/icons-react-native";
import {
  AgentTrace,
  AgentTraceCollapsible,
  AgentTraceCollapsibleContent,
  AgentTraceCollapsibleTrigger,
  AgentTraceDescription,
  AgentTraceFold,
  AgentTraceIcon,
  AgentTraceLine,
  AgentTraceTitle,
} from "@vvedantb/native-ui/ai";
import { Markdown } from "@vvedantb/native-ui/markdown";
import * as Clipboard from "expo-clipboard";
import type { ComponentType } from "react";
import { View } from "react-native";
import { StepDetail } from "./StepDetail";

/** The code block's copy button, as the web code header. */
const copyCode = async (code: string) => {
  await Clipboard.setStringAsync(code);
};

/** Same icon per step type as the web trace (`activity-shared.tsx` in @vvedantb/ui). */
const STEP_ICONS: Record<ToolStepType, ComponentType<IconProps>> = {
  read: IconFileSearch,
  edit: IconPencil,
  write: IconFilePlus,
  bash: IconTerminal2,
  search_files: IconFolderSearch,
  search_code: IconFileText,
  web_fetch: IconWorld,
  web_search: IconSearch,
  subtask: IconSitemap,
  notebook: IconBook2,
  tool: IconTool,
};

/** One tool step in a run. A step with a command, output or edits opens to them, as the web rows do. */
function StepRow({ step, index, messageId }: TraceStep & { messageId: string }) {
  const active = step.status === "active";
  const line = (
    <AgentTraceLine status={active ? "running" : step.status === "pending" ? "pending" : undefined}>
      <AgentTraceIcon icon={STEP_ICONS[step.type]} />
      {/* Inside the run's rail a long path or command cuts off, not the label (web rows truncate the line). */}
      <AgentTraceTitle shimmer={active} className="shrink-0">
        {step.label}
      </AgentTraceTitle>
      {step.detail ? <AgentTraceDescription className="min-w-0 shrink">{step.detail}</AgentTraceDescription> : null}
    </AgentTraceLine>
  );
  if (!hasStepDetail(step)) return line;
  return (
    <AgentTraceCollapsible>
      <AgentTraceCollapsibleTrigger>{line}</AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent>
        <StepDetail step={step} index={index} messageId={messageId} />
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

/**
 * A run of tool steps behind one summary line ("Searched the code, read
 * files"), as the web `ActivityActionGroup`: the first step's icon, open while
 * a step in it runs, the steps behind a rail when open.
 */
function StepRun({ steps, messageId }: { steps: TraceStep[]; messageId: string }) {
  const active = steps.some(({ step }) => step.status === "active");
  const summary = summariseToolSteps(steps.map(({ step }) => step));
  return (
    <AgentTraceCollapsible defaultOpen={active}>
      <AgentTraceCollapsibleTrigger>
        <AgentTraceLine status={active ? "running" : undefined}>
          <AgentTraceIcon icon={STEP_ICONS[steps[0]?.step.type ?? "tool"]} />
          <AgentTraceTitle shimmer={active}>{summary}</AgentTraceTitle>
        </AgentTraceLine>
      </AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent className="gap-2">
        {steps.map((row) => (
          <StepRow key={row.index} {...row} messageId={messageId} />
        ))}
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

/**
 * An agent reply: its trace as the web's folded `ActivityTasks` (reasoning as
 * prose, each run of tool steps behind a summary line), all behind "Worked
 * for …" once the turn finished, then the reply as markdown (native-ui
 * `/markdown`, the web `markdown.css` scale).
 */
export function AssistantMessage({
  messageId,
  content,
  activityLog,
  duration,
}: {
  /** For loading a trimmed step's full detail. */
  messageId: string;
  content: string;
  activityLog?: string;
  /** How long the turn ran ("2m", the web `formatDuration`), once it finished. Folds the trace behind "Worked for …". */
  duration?: string;
}) {
  const segments = parseTraceSegments(activityLog);
  const trace = segments.map((segment, index) =>
    segment.kind === "actions" ? (
      <StepRun key={index} steps={segment.steps} messageId={messageId} />
    ) : segment.text ? (
      // Web `ActivityReasoningBlock`: the reply's markdown, `my-1`.
      <View key={index} className="my-1">
        <Markdown onCopyCode={copyCode}>{segment.text}</Markdown>
      </View>
    ) : null,
  );
  return (
    <>
      {segments.length === 0 ? null : duration !== undefined ? (
        <AgentTraceFold duration={duration}>{trace}</AgentTraceFold>
      ) : (
        <AgentTrace>{trace}</AgentTrace>
      )}
      {content.trim() !== "" ? <Markdown onCopyCode={copyCode}>{content}</Markdown> : null}
    </>
  );
}
