import { api } from "@eva/backend";
import { collectQuestionSteps, stripErrorPrefix } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { parseActivityLog, type ActivityLogStep } from "@eva/shared/activityTrace";
import {
  IconAlertTriangle,
  IconAnchor,
  IconBook2,
  IconBrain,
  IconCircle,
  IconCircleCheck,
  IconFilePlus,
  IconFileSearch,
  IconFileText,
  IconFolderSearch,
  IconGitBranch,
  IconInfoCircle,
  IconListCheck,
  IconMessage,
  IconPencil,
  IconPlayerStop,
  IconSearch,
  IconSitemap,
  IconSteeringWheel,
  IconTerminal2,
  IconTool,
  IconWorld,
  type IconProps,
} from "@tabler/icons-react-native";
import {
  ACTIVITY_MAX_VISIBLE_BLOCKS,
  ActivityQuestionCard,
  activityChildRows,
  activityRowKey,
  activitySegmentKey,
  activityStepHasRichDetail,
  activityStepSeconds,
  AgentTrace,
  AgentTraceCollapsible,
  AgentTraceCollapsibleContent,
  AgentTraceCollapsibleTrigger,
  AgentTraceDescription,
  AgentTraceFold,
  AgentTraceIcon,
  AgentTraceLine,
  AgentTraceTitle,
  deriveActionGroupSummary,
  deriveStepRowPresentation,
  FileChip,
  foldedActivitySegments,
  formatElapsed,
  resolveCommandVisualKind,
  type ActivityRow,
  type ActivitySegment,
  type AgentTraceStatus,
  Shimmer,
} from "@vvedantb/native-ui/ai";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Button, Spinner, Text } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import type { ResolvedMediaEntry } from "@eva/shared";
import { useDeferredValue, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { copyText } from "@/ui/copyText";
import { textColor, useScheme } from "@/ui/theme";
import { ChatUiPanelTabs } from "./cards/ChatUiPanelTabs";
import { AgentMedia } from "./media/AgentMedia";
import { StepDetail } from "./StepDetail";

const STEP_ICONS: Record<Exclude<ActivityLogStep["type"], "status">, ComponentType<IconProps>> = {
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
  thinking: IconBrain,
  reasoning: IconBrain,
  response: IconMessage,
  question: IconMessage,
  todos: IconListCheck,
  tool: IconTool,
  notice: IconInfoCircle,
  hook: IconAnchor,
  steer: IconSteeringWheel,
};

const COMMAND_ICONS = { inspect: IconSearch, git: IconGitBranch, terminal: IconTerminal2 } as const;

function StepIcon({ step }: { step: ActivityLogStep }) {
  if (step.type === "status") {
    return (
      <AgentTraceIcon>
        <Spinner size="sm" decorative />
      </AgentTraceIcon>
    );
  }
  const icon = step.type === "bash" && step.detail ? COMMAND_ICONS[resolveCommandVisualKind(step.detail)] : STEP_ICONS[step.type];
  return <AgentTraceIcon icon={icon} />;
}

function traceStatus(step: ActivityLogStep): AgentTraceStatus | undefined {
  if (step.isError) return "error";
  if (step.status === "active") return "running";
  return step.status === "pending" ? "pending" : undefined;
}

function MutedText({ size, children }: { size: "text-xs" | "text-sm"; children: string }) {
  const scheme = useScheme();
  return (
    <Text className={`font-instrument-sans ${size}`} style={textColor(scheme, "muted")}>
      {children}
    </Text>
  );
}

type RowProps = { row: ActivityRow; steps: ActivityLogStep[]; messageId: string };

function TodoChecklist({ step }: { step: ActivityLogStep }) {
  const scheme = useScheme();
  const muted = textColor(scheme, "muted");
  const todos = step.todos ?? [];
  if (todos.length === 0) {
    return (
      <Text className="font-instrument-sans text-sm" style={muted}>
        {step.detail ?? step.label}
      </Text>
    );
  }
  return (
    <View className="gap-2">
      {todos.map((todo) => (
        <View key={todo.content} className="flex-row items-start gap-2" style={todo.status === "pending" ? { opacity: 0.6 } : null}>
          <View className="mt-0.5 h-3.5 w-3.5 items-center justify-center">
            {todo.status === "completed" ? (
              <IconCircleCheck size={14} color={EVA_THEME[scheme].primary} />
            ) : todo.status === "in_progress" ? (
              <Spinner size="sm" decorative />
            ) : (
              <IconCircle size={14} color={EVA_THEME[scheme].mutedForeground} />
            )}
          </View>
          <Text
            className={todo.status === "in_progress" ? "flex-1 font-instrument-sans-medium text-sm" : "flex-1 font-instrument-sans text-sm"}
            style={[
              { lineHeight: 19 },
              todo.status === "in_progress" ? { ...textColor(scheme), fontWeight: "500" } : muted,
              todo.status === "completed" ? { textDecorationLine: "line-through" } : null,
            ]}
          >
            {todo.content}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TodosRow({ step }: { step: ActivityLogStep }) {
  const active = step.status === "active";
  const todos = step.todos ?? [];
  const done = todos.filter((todo) => todo.status === "completed").length;
  return (
    <AgentTraceCollapsible defaultOpen={active}>
      <AgentTraceCollapsibleTrigger>
        <AgentTraceLine status={active ? "running" : undefined}>
          <AgentTraceIcon icon={IconListCheck} />
          <AgentTraceTitle shimmer={active}>{deriveStepRowPresentation(step, active).text}</AgentTraceTitle>
          {todos.length > 0 ? <AgentTraceDescription>{`${done}/${todos.length}`}</AgentTraceDescription> : null}
        </AgentTraceLine>
      </AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent>
        <TodoChecklist step={step} />
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

function ReasoningRow({ step }: { step: ActivityLogStep }) {
  const active = step.status === "active";
  const seconds = activityStepSeconds(step);
  const line = (
    <AgentTraceLine status={active ? "running" : undefined}>
      <AgentTraceIcon icon={IconBrain} />
      <AgentTraceTitle shimmer={active}>{active ? "Thinking..." : "Thought"}</AgentTraceTitle>
      {seconds ? <AgentTraceDescription>{formatElapsed(seconds)}</AgentTraceDescription> : null}
    </AgentTraceLine>
  );
  const thoughts = step.detail?.trim();
  if (!thoughts) return line;
  return (
    <AgentTraceCollapsible defaultOpen={active}>
      <AgentTraceCollapsibleTrigger>{line}</AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent>
        <Markdown onCopyCode={copyText}>{thoughts}</Markdown>
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

function StepRow({ row, steps, messageId }: RowProps) {
  const { step } = row;
  if (step.type === "todos") return <TodosRow step={step} />;
  if (step.type === "reasoning") return <ReasoningRow step={step} />;
  const active = step.status === "active";
  const presentation = deriveStepRowPresentation(step, active);
  const children = activityChildRows(row);
  const seconds = activityStepSeconds(step);
  const description =
    children.total > 0 ? `${children.total} ${children.total === 1 ? "step" : "steps"}` : seconds ? formatElapsed(seconds) : undefined;
  const chip = presentation.fileChip ? <FileChip name={presentation.fileChip.name} /> : null;
  const descriptionText = description ? <AgentTraceDescription>{description}</AgentTraceDescription> : null;
  const head = (
    <>
      <StepIcon step={step} />
      <AgentTraceTitle shimmer={active} className={chip ? "shrink-0" : undefined}>
        {presentation.text}
      </AgentTraceTitle>
    </>
  );
  const hasDetail = activityStepHasRichDetail(step);
  if (!hasDetail && children.shown.length === 0) {
    return (
      <AgentTraceLine status={traceStatus(step)}>
        {head}
        {chip}
        {descriptionText}
      </AgentTraceLine>
    );
  }
  const index = steps.indexOf(step);
  return (
    <AgentTraceCollapsible defaultOpen={children.shown.length > 0}>
      <AgentTraceCollapsibleTrigger
        trailing={
          chip ? (
            <>
              {chip}
              {descriptionText}
            </>
          ) : undefined
        }
      >
        <AgentTraceLine status={traceStatus(step)}>
          {head}
          {chip ? null : descriptionText}
        </AgentTraceLine>
      </AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent className="gap-1">
        {hasDetail ? <StepDetail step={step} index={index} messageId={messageId} /> : null}
        {children.shown.map((child, childIndex) => (
          <StepRow key={activityRowKey(child, childIndex)} row={child} steps={steps} messageId={messageId} />
        ))}
        {children.overflow > 0 ? <MutedText size="text-xs">{`+${children.overflow} more`}</MutedText> : null}
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

function StepRun({ rows, steps, messageId }: { rows: ActivityRow[]; steps: ActivityLogStep[]; messageId: string }) {
  const active = rows.some(({ step }) => step.status === "active");
  const first = rows[0]?.step;
  return (
    <AgentTraceCollapsible defaultOpen={active}>
      <AgentTraceCollapsibleTrigger>
        <AgentTraceLine status={active ? "running" : undefined}>
          {first ? <StepIcon step={first} /> : <AgentTraceIcon icon={IconTerminal2} />}
          <AgentTraceTitle shimmer={active}>{deriveActionGroupSummary(rows.map(({ step }) => step))}</AgentTraceTitle>
        </AgentTraceLine>
      </AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent>
        {rows.map((row, index) => (
          <StepRow key={activityRowKey(row, index)} row={row} steps={steps} messageId={messageId} />
        ))}
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}

function Segment({ segment, steps, messageId }: { segment: ActivitySegment; steps: ActivityLogStep[]; messageId: string }) {
  if (segment.kind === "actions") return <StepRun rows={segment.rows} steps={steps} messageId={messageId} />;
  if (segment.kind === "row") return <StepRow row={segment.row} steps={steps} messageId={messageId} />;
  const text = segment.step.detail?.trim();
  return text ? (
    <View className="my-1">
      <Markdown onCopyCode={copyText} onCopyTable={copyText}>
        {text}
      </Markdown>
    </View>
  ) : null;
}

function SegmentList({ segments, steps, messageId, live }: { segments: ActivitySegment[]; steps: ActivityLogStep[]; messageId: string; live: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = segments.length - ACTIVITY_MAX_VISIBLE_BLOCKS;
  const visible =
    overflow > 0 && !expanded
      ? live
        ? segments.slice(overflow)
        : segments.slice(0, ACTIVITY_MAX_VISIBLE_BLOCKS)
      : segments;
  const offset = overflow > 0 && !expanded && live ? overflow : 0;
  const toggle: ReactNode =
    overflow > 0 ? (
      <Pressable
        accessibilityRole="button"
        hitSlop={{ top: 12, bottom: 12 }}
        onPress={() => setExpanded(!expanded)}
        className="self-start active:opacity-70"
      >
        <MutedText size="text-sm">{expanded ? "Show less" : `Show ${overflow} more`}</MutedText>
      </Pressable>
    ) : null;
  return (
    <>
      {live ? toggle : null}
      {visible.map((segment, index) => (
        <Segment key={activitySegmentKey(segment, offset + index)} segment={segment} steps={steps} messageId={messageId} />
      ))}
      {live ? null : toggle}
    </>
  );
}

function LiveStatus({ steps }: { steps: ActivityLogStep[] }) {
  const work = steps.filter((step) => step.type !== "response");
  const current = work.find((step) => step.status === "active") ?? work[0];
  return (
    <View className="flex-row items-center gap-2">
      <Spinner size="sm" decorative />
      <Shimmer duration={2.5}>{current?.label ?? "Working..."}</Shimmer>
    </View>
  );
}

/** The live status line on its own, for a stream that is not a reply (the session summary while it writes). */
export function LiveActivityStatus({ activityLog }: { activityLog: string | undefined }) {
  return <LiveStatus steps={parseActivityLog(activityLog)} />;
}

/**
 * An agent reply: its trace as the web's folded `ActivityTasks` (reasoning as
 * prose, each run of tool steps behind a summary line, to-dos and notices on
 * their own lines), all behind "Worked for …" once the turn finished (none
 * with `hideTrace`), then the reply as markdown (native-ui `/markdown`, the
 * web `markdown.css` scale), then the screenshots and recordings the agent posted
 * (the web `AgentMedia`). With `tabPanels` (the turn's agent-composed cards)
 * the reply is behind a "Text" tab and the cards in front ("UI"), as the web.
 */
export function AssistantMessage({
  messageId,
  content,
  activityLog,
  duration,
  hideTrace = false,
  media,
  tabPanels,
  live = false,
  failure,
  stopped = false,
}: {
  messageId: string;
  content: string;
  activityLog?: string;
  duration?: string;
  hideTrace?: boolean;
  media?: ResolvedMediaEntry[];
  tabPanels?: ReactNode;
  live?: boolean;
  failure?: { title: string; onRetry?: () => void };
  stopped?: boolean;
}) {
  const steps = parseActivityLog(activityLog);
  const segments = foldedActivitySegments(steps);
  const settled = content !== "" || duration !== undefined;
  const questionSteps = settled ? collectQuestionSteps(steps) : [];
  const trace = <SegmentList segments={segments} steps={steps} messageId={messageId} live={duration === undefined} />;
  const prose = (
    <Markdown onCopyCode={copyText} onCopyTable={copyText}>
      {content}
    </Markdown>
  );
  return (
    <>
      {hideTrace ? null : segments.length === 0 ? (
        live ? (
          <AgentTrace>
            <LiveStatus steps={steps} />
          </AgentTrace>
        ) : null
      ) : duration !== undefined ? (
        <AgentTraceFold duration={duration}>{trace}</AgentTraceFold>
      ) : (
        <AgentTrace>{trace}</AgentTrace>
      )}
      {questionSteps.map((step, index) => (
        <ActivityQuestionCard key={step.toolUseId ?? index} questions={step.questions ?? []} answers={step.answers} />
      ))}
      {failure ? (
        <TurnErrorNotice title={failure.title} detail={stripErrorPrefix(content)} onRetry={failure.onRetry} />
      ) : content.trim() !== "" ? (
        tabPanels ? (
          <ChatUiPanelTabs panel={tabPanels} text={prose} />
        ) : (
          prose
        )
      ) : null}
      {stopped ? <StoppedLine /> : null}
      {media ? <AgentMedia entries={media} /> : null}
    </>
  );
}

function StoppedLine() {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <View accessibilityRole="text" className="mt-1 flex-row items-center gap-1">
      <IconPlayerStop size={12} color={muted} />
      <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
        Stopped
      </Text>
    </View>
  );
}

/**
 * The reply of the turn that is running, drawn from the chat's streaming row
 * (`api.streaming.get`) as the web `ChatBody` streaming bubble: the live
 * timeline, then the streamed text. Only this row reads the stream, so a token
 * re-renders it and not the transcript. The activity is deferred, as the web:
 * the text the user reads commits first, and the timeline (a large JSON
 * payload) re-renders at transition priority.
 */
export function LiveAssistantMessage({ streamingEntityId, messageId }: { streamingEntityId: string; messageId: string }) {
  const streaming = useQuery(api.streaming.get, { entityId: streamingEntityId });
  const activity = useDeferredValue(streaming?.currentActivity);
  return (
    <AssistantMessage messageId={messageId} content={streaming?.currentContent ?? ""} activityLog={activity} live />
  );
}

function TurnErrorNotice({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: withAlpha(theme.destructive, 0.1) }}>
      <View className="pt-0.5">
        <IconAlertTriangle size={16} color={theme.destructive} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-instrument-sans-medium text-sm" style={{ color: theme.foreground, fontWeight: "500" }}>
          {title}
        </Text>
        {detail ? (
          <Text className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Button size="sm" variant="outline" fullWidth={false} onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </View>
  );
}
