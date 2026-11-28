"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { IconBrain } from "@tabler/icons-react";
import { api } from "@eva/backend";
import {
  ActivityTasks,
  Shimmer,
  AgentTraceCollapsible,
  AgentTraceCollapsibleContent,
  AgentTraceCollapsibleTrigger,
  AgentTraceIcon,
  AgentTraceLine,
  AgentTraceTitle,
  Collapsible,
  CollapsibleContent,
  Spinner,
  formatActivityElapsed,
  useActivityElapsedSeconds,
  RollingNumber,
  type ActivityLayout,
  type ActivityStep,
} from "@vvedantb/ui";
import {
  isEmptyActivityPayload,
  isSandboxStartupActivity,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import { formatDuration } from "@eva/shared/duration";
import { splitStepsAtQuestions, type QuestionSplitChunk } from "@eva/shared";
import { AssistantQuestionRecord } from "@/lib/components/chat/_components/AssistantQuestionCards";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useActivityLayout } from "@/lib/hooks/useActivityLayout";
import { SandboxStartupIndicator } from "@/lib/components/sandbox/SandboxStartupIndicator";
import { SandboxStartupSteps } from "@/lib/components/sandbox/SandboxStartupSteps";
import {
  silentStreamDelayMs,
  thinkingHeartbeatLabel,
  thinkingHeartbeatSeconds,
  visibleActivityKey,
} from "@/lib/components/streamingActivityHeartbeat";

const SILENT_STREAM_NOTICE_AFTER_SECONDS = 60;

function SimpleViewWorkingStatus({ startedAt }: { startedAt?: number }) {
  const elapsed = useActivityElapsedSeconds(startedAt, true);
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Spinner size="sm" />
      <span>
        <Shimmer as="span" duration={2.5} spread={1.5}>
          Working for
        </Shimmer>{" "}
        <RollingNumber value={formatActivityElapsed(elapsed)} />
      </span>
    </div>
  );
}

function SimpleViewHeartbeat({
  lastOutputAt,
  isStreaming,
  startedAt,
}: {
  lastOutputAt: number;
  isStreaming: boolean;
  startedAt?: number;
}) {
  const sinceLastOutput = useActivityElapsedSeconds(
    lastOutputAt,
    Boolean(isStreaming && startedAt),
  );
  const heartbeatSeconds = thinkingHeartbeatSeconds(sinceLastOutput);
  if (heartbeatSeconds == null) return null;
  return (
    <div className="text-muted-foreground text-sm tabular-nums">
      {thinkingHeartbeatLabel(heartbeatSeconds)}
    </div>
  );
}

function useSilentStreamNotice(
  activity: string | undefined,
  isStreaming: boolean,
  startedAt: number | undefined,
) {
  const [silent, setSilent] = useState(false);
  /* eslint-disable no-effect/no-adjust-state-on-prop-change --
     The notice appears on a timer, not on the prop change itself: the stream
     has to stay empty for N seconds before it flips. */
  useEffect(() => {
    if (!isStreaming || !isEmptyActivityPayload(activity)) {
      setSilent(false);
      return;
    }
    const remaining = silentStreamDelayMs(
      startedAt,
      Date.now(),
      SILENT_STREAM_NOTICE_AFTER_SECONDS,
    );
    if (remaining <= 0) {
      setSilent(true);
      return;
    }
    setSilent(false);
    const timer = window.setTimeout(() => setSilent(true), remaining);
    return () => window.clearTimeout(timer);
  }, [activity, isStreaming, startedAt]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change */
  return silent;
}

function useLastVisibleOutputAt(
  activity: string | undefined,
  isStreaming: boolean,
  startedAt?: number,
) {
  const visibleKey = visibleActivityKey(activity);
  const prevKeyRef = useRef(visibleKey);
  const prevStartedAtRef = useRef(startedAt);
  const [lastOutputAt, setLastOutputAt] = useState(() =>
    visibleKey ? Date.now() : (startedAt ?? Date.now()),
  );

  /* eslint-disable no-effect/no-derived-state, no-effect/no-event-handler --
     `Date.now()` is not derivable: the value being stored is *when* the stream
     last changed, which can only be read at the moment the change lands. */
  useEffect(() => {
    if (startedAt !== prevStartedAtRef.current) {
      prevStartedAtRef.current = startedAt;
      prevKeyRef.current = visibleKey;
      setLastOutputAt(visibleKey ? Date.now() : (startedAt ?? Date.now()));
      return;
    }
    if (!isStreaming) return;
    if (visibleKey !== prevKeyRef.current) {
      prevKeyRef.current = visibleKey;
      if (visibleKey) setLastOutputAt(Date.now());
    }
  }, [visibleKey, isStreaming, startedAt]);
  /* eslint-enable no-effect/no-derived-state, no-effect/no-event-handler */

  return lastOutputAt;
}

export function StreamingActivityDisplay({
  activity,
  isStreaming = true,
  name,
  icon,
  thinkingLabel = "Working...",
  startedAt,
  onOpenFile,
  isSandboxStartup = false,
}: {
  activity: string | undefined;
  isStreaming?: boolean;
  name?: string;
  icon?: ReactNode;
  thinkingLabel?: string;
  startedAt?: number;
  onOpenFile?: (path: string) => void;
  isSandboxStartup?: boolean;
}) {
  const simpleView = useSimpleView();
  const layout = useActivityLayout();
  const lastOutputAt = useLastVisibleOutputAt(activity, isStreaming, startedAt);
  const streamIsSilent = useSilentStreamNotice(
    activity,
    isStreaming,
    startedAt,
  );
  const startingSandbox =
    isSandboxStartup || isSandboxStartupActivity(activity);

  if (simpleView) {
    if (!isStreaming) return null;
    if (startingSandbox) return <SandboxStartupIndicator />;
    return (
      <div className="space-y-1.5">
        <SimpleViewWorkingStatus startedAt={startedAt} />
        <SimpleViewHeartbeat
          lastOutputAt={lastOutputAt}
          isStreaming={isStreaming}
          startedAt={startedAt}
        />
      </div>
    );
  }

  if (startingSandbox && isStreaming) {
    return <SandboxStartupSteps activity={activity} startedAt={startedAt} />;
  }

  const steps = parseActivitySteps(activity);

  return (
    <ActivityTimeline
      steps={
        steps ?? [
          {
            type: "thinking",
            label: streamIsSilent
              ? "Working — no activity reported"
              : thinkingLabel,
            status: "active",
          },
        ]
      }
      isStreaming={isStreaming}
      name={name}
      icon={icon}
      startedAt={startedAt}
      onOpenFile={onOpenFile}
      layout={layout}
    />
  );
}

interface ActivityTimelineProps {
  steps: ActivityStep[];
  isStreaming?: boolean;
  name?: string;
  icon?: ReactNode;
  startedAt?: number;
  duration?: string;
  onOpenFile?: (path: string) => void;
  onRequestFullDetail?: () => void;
  layout: ActivityLayout;
}

function ActivityTimeline(props: ActivityTimelineProps) {
  const chunks = splitStepsAtQuestions(props.steps);
  if (chunks.length === 1) return <ActivityTasks {...props} />;
  if (!props.isStreaming && props.duration && props.layout === "folded") {
    return (
      <FoldedQuestionTimeline
        {...props}
        duration={props.duration}
        chunks={chunks}
      />
    );
  }
  return <QuestionChunks {...props} chunks={chunks} />;
}

function QuestionChunks({
  chunks,
  isStreaming,
  name,
  icon,
  startedAt,
  onOpenFile,
  onRequestFullDetail,
  layout,
}: Omit<ActivityTimelineProps, "steps" | "duration"> & {
  chunks: QuestionSplitChunk<ActivityStep>[];
}) {
  return chunks.map((chunk, index) => {
    const isLast = index === chunks.length - 1;
    return (
      <div key={chunk.question?.toolUseId ?? index}>
        <ActivityTasks
          steps={chunk.steps}
          isStreaming={isLast ? isStreaming : false}
          name={name}
          icon={icon}
          startedAt={startedAt}
          onOpenFile={onOpenFile}
          onRequestFullDetail={onRequestFullDetail}
          layout={layout}
        />
        {chunk.question ? (
          <AssistantQuestionRecord step={chunk.question} />
        ) : null}
      </div>
    );
  });
}

function FoldedQuestionTimeline({
  duration,
  onRequestFullDetail,
  ...props
}: Omit<ActivityTimelineProps, "steps" | "duration"> & {
  duration: string;
  chunks: QuestionSplitChunk<ActivityStep>[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Collapsible
        className="group text-sm"
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) onRequestFullDetail?.();
        }}
      >
        <div className="border-b border-border pb-1.5">
          <AgentTraceCollapsibleTrigger>
            <AgentTraceLine>
              <AgentTraceTitle>{`Worked for ${duration}`}</AgentTraceTitle>
            </AgentTraceLine>
          </AgentTraceCollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2">
          <QuestionChunks
            {...props}
            {...(onRequestFullDetail ? { onRequestFullDetail } : {})}
          />
        </CollapsibleContent>
      </Collapsible>
      {open
        ? null
        : props.chunks.map((chunk, index) =>
            chunk.question ? (
              <AssistantQuestionRecord
                key={chunk.question.toolUseId ?? index}
                step={chunk.question}
              />
            ) : null,
          )}
    </>
  );
}

/**
 * Live sandbox startup block for a chat's `transcriptTail`. Null when hidden
 * so the transcript's empty state shows instead. Shared by the session,
 * quick task and project chats so startup renders in one place everywhere.
 */
export function sandboxStartupTail(
  activity: string | undefined,
  show: boolean,
): ReactNode {
  return show ? (
    <StreamingActivityDisplay activity={activity} isSandboxStartup />
  ) : null;
}

function useFullActivityLog(messageId: string | undefined) {
  const [requested, setRequested] = useState(false);
  const fullLog = useQuery(
    api.messages.activityLogById,
    requested && messageId ? { messageId } : "skip",
  );
  return {
    fullLog: fullLog ?? undefined,
    request: messageId ? () => setRequested(true) : undefined,
  };
}

export function ActivityLogDisplay({
  activityLog,
  messageId,
  name,
  icon,
  startedAt,
  finishedAt,
  onOpenFile,
}: {
  activityLog: string;
  messageId?: string;
  name?: string;
  icon?: ReactNode;
  startedAt?: number;
  finishedAt?: number;
  onOpenFile?: (path: string) => void;
}) {
  const simpleView = useSimpleView();
  const layout = useActivityLayout();
  const { fullLog, request } = useFullActivityLog(messageId);
  const duration =
    startedAt && finishedAt ? formatDuration(startedAt, finishedAt) : undefined;

  if (simpleView) {
    return null;
  }

  const steps = parseActivitySteps(fullLog ?? activityLog);

  if (steps) {
    return (
      <ActivityTimeline
        steps={steps}
        name={name}
        icon={icon}
        duration={duration}
        onOpenFile={onOpenFile}
        onRequestFullDetail={request}
        layout={layout}
      />
    );
  }

  const trimmedLog = activityLog.trim();
  if (trimmedLog === "" || trimmedLog === "[]") {
    return null;
  }

  return (
    <AgentTraceCollapsible defaultOpen={false}>
      <AgentTraceCollapsibleTrigger>
        <AgentTraceLine>
          <AgentTraceIcon>
            <IconBrain />
          </AgentTraceIcon>
          <AgentTraceTitle>View logs</AgentTraceTitle>
        </AgentTraceLine>
      </AgentTraceCollapsibleTrigger>
      <AgentTraceCollapsibleContent>
        <pre className="whitespace-pre-wrap max-sm:wrap-break-word font-mono text-xs max-h-64 overflow-y-auto scroll-fade">
          {activityLog}
        </pre>
      </AgentTraceCollapsibleContent>
    </AgentTraceCollapsible>
  );
}
