import { collectChangedFiles } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { parseActivityLog, type ActivityLogStep } from "@eva/shared/activityTrace";
import {
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
} from "@vvedantb/native-ui/ai";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Spinner, Text } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { useState, type ComponentType, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { copyText } from "@/ui/copyText";
import { textColor, useScheme } from "@/ui/theme";
import { ChangedFilesCard } from "./ChangedFilesCard";
import { StepDetail } from "./StepDetail";

/** Same icon per step type as the web trace (`activityStepConfig` in @vvedantb/ui). `status` draws a spinner. */
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

/** Shell steps take the glyph of what they ran (web `iconForStep`): a search, git, or the terminal. */
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

/** Where a row's step sits in the parsed log, to load its trimmed detail (`StepDetail`). */
type RowProps = { row: ActivityRow; steps: ActivityLogStep[]; messageId: string };

/** The web `TodoChecklist`: a status glyph per item, done items struck through, waiting ones faded. */
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
              <IconCircle size={14} color={tokens.color.muted[scheme]} />
            )}
          </View>
          {/* Web `leading-snug` (1.375). */}
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

/** A to-do snapshot as one line with done/total, folding open to the checklist (web `ActivityTodosLine`). */
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

/** A subagent's own thinking, behind "Thought  12s" (web `ActivityReasoningLine`). */
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

/**
 * One step as the web `ActivityStepRow`: a short verb, a file chip or the
 * command, and the time it took ("Created toCsv.ts  ›", "Ran pnpm test  4s").
 * A step with a command, output or edits opens to them; a subagent opens to
 * the steps it ran ("3 steps"), up to 8 and "+N more".
 */
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
      {/* A long command cuts off; the verb before a chip keeps its width. */}
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
    // Subagent rows start open so the steps they ran stay in view, as the web.
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
      {/* The 28 high rows bring their own 4 above and below, so 4 more keeps the detail 8 clear of them. */}
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

/**
 * A run of tool steps behind one summary line ("Searched the code, read
 * files"), as the web `ActivityActionGroup`: the first step's icon, open while
 * a step in it runs, the steps behind a rail when open. The summary stays
 * muted when a step in it failed; the failed row is red once open.
 */
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
      {/* The rows stack at the trace's 28 pitch, each line its own whole target. */}
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
  // Web `ActivityReasoningBlock`: the reasoning as the reply's markdown, `my-1`.
  return text ? (
    <View className="my-1">
      <Markdown onCopyCode={copyText} onCopyTable={copyText}>
        {text}
      </Markdown>
    </View>
  ) : null;
}

/**
 * The timeline blocks with the web cap: past 8, a settled turn shows the
 * first 8 and "Show N more" after them; a live one the newest 8, with the
 * toggle above.
 */
function SegmentList({ segments, steps, messageId, live }: { segments: ActivitySegment[]; steps: ActivityLogStep[]; messageId: string; live: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = segments.length - ACTIVITY_MAX_VISIBLE_BLOCKS;
  const visible =
    overflow > 0 && !expanded
      ? live
        ? segments.slice(overflow)
        : segments.slice(0, ACTIVITY_MAX_VISIBLE_BLOCKS)
      : segments;
  // Keys follow the full list, so a block keeps its fold state when the cap moves.
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

/**
 * An agent reply: its trace as the web's folded `ActivityTasks` (reasoning as
 * prose, each run of tool steps behind a summary line, to-dos and notices on
 * their own lines), all behind "Worked for …" once the turn finished, then
 * the reply as markdown (native-ui `/markdown`, the web `markdown.css` scale),
 * then the files the turn changed (the web `ChangedFilesCard`) once it has
 * text or has finished.
 */
export function AssistantMessage({
  messageId,
  content,
  activityLog,
  duration,
  isLatestAssistantTurn,
  onOpenDiff,
}: {
  /** For loading a trimmed step's full detail. */
  messageId: string;
  content: string;
  activityLog?: string;
  /** How long the turn ran ("2m", the web `formatDuration`), once it finished. Folds the trace behind "Worked for …". */
  duration?: string;
  /** The latest reply opens its changed files, as the web. */
  isLatestAssistantTurn: boolean;
  /** Opens the diff screen at a changed file. Without it (simple view, as the web) there is no card. */
  onOpenDiff?: (path: string | undefined) => void;
}) {
  const steps = parseActivityLog(activityLog);
  const segments = foldedActivitySegments(steps);
  // The web skips a reply still streaming its first text (`getAssistantTurnState`).
  const settled = content !== "" || duration !== undefined;
  const changedFiles = onOpenDiff && settled ? collectChangedFiles(steps) : [];
  const trace = <SegmentList segments={segments} steps={steps} messageId={messageId} live={duration === undefined} />;
  return (
    <>
      {segments.length === 0 ? null : duration !== undefined ? (
        <AgentTraceFold duration={duration}>{trace}</AgentTraceFold>
      ) : (
        <AgentTrace>{trace}</AgentTrace>
      )}
      {content.trim() !== "" ? (
        <Markdown onCopyCode={copyText} onCopyTable={copyText}>
          {content}
        </Markdown>
      ) : null}
      {onOpenDiff ? (
        <ChangedFilesCard files={changedFiles} isLatestAssistantTurn={isLatestAssistantTurn} onOpenDiff={onOpenDiff} />
      ) : null}
    </>
  );
}
