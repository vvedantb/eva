import { hasStepDetail, parseToolSteps, summariseToolSteps, type ToolStepType } from "@eva/shared/activityTrace";
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
  ActivityStep,
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

/**
 * An agent reply: a finished turn's steps fold behind "Worked for …" (an
 * unfinished one behind a summary of the kinds of work), as the web does, then
 * the reply as markdown (native-ui `/markdown`, the web `markdown.css` scale).
 */
export function AssistantMessage({
  messageId,
  content,
  activityLog,
  seconds,
}: {
  /** For loading a trimmed step's full detail. */
  messageId: string;
  content: string;
  activityLog?: string;
  /** How long the turn ran, once it finished. Folds the steps behind "Worked for …", as the web does. */
  seconds?: number;
}) {
  const steps = parseToolSteps(activityLog);
  // A step with a command, output or edits opens to them, as the web rows do.
  const stepRows = steps.map((step, index) =>
    hasStepDetail(step) ? (
      <AgentTraceCollapsible key={index}>
        <AgentTraceCollapsibleTrigger>
          <AgentTraceLine>
            <AgentTraceIcon icon={STEP_ICONS[step.type]} />
            <AgentTraceTitle>{step.label}</AgentTraceTitle>
            {step.detail ? <AgentTraceDescription>{step.detail}</AgentTraceDescription> : null}
          </AgentTraceLine>
        </AgentTraceCollapsibleTrigger>
        <AgentTraceCollapsibleContent>
          <StepDetail step={step} index={index} messageId={messageId} />
        </AgentTraceCollapsibleContent>
      </AgentTraceCollapsible>
    ) : (
      <ActivityStep
        key={index}
        icon={STEP_ICONS[step.type]}
        label={step.label}
        description={step.detail}
        status={step.status === "complete" ? "complete" : "running"}
      />
    ),
  );
  return (
    <>
      {steps.length === 0 ? null : seconds !== undefined ? (
        <AgentTraceFold seconds={seconds}>{stepRows}</AgentTraceFold>
      ) : (
        <AgentTraceCollapsible>
          <AgentTraceCollapsibleTrigger>
            <AgentTraceLine>
              <AgentTraceIcon icon={STEP_ICONS[steps[0]?.type ?? "tool"]} />
              <AgentTraceTitle>{summariseToolSteps(steps)}</AgentTraceTitle>
            </AgentTraceLine>
          </AgentTraceCollapsibleTrigger>
          <AgentTraceCollapsibleContent>
            <AgentTrace>{stepRows}</AgentTrace>
          </AgentTraceCollapsibleContent>
        </AgentTraceCollapsible>
      )}
      {content.trim() !== "" ? <Markdown onCopyCode={copyCode}>{content}</Markdown> : null}
    </>
  );
}
