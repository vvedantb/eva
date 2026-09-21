"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityTasks,
  Reasoning,
  ReasoningTrigger,
  CollapsibleContent,
  Shimmer,
  Spinner,
  formatElapsed,
  useElapsedSeconds,
} from "@eva/ui";
import {
  isEmptyActivityPayload,
  parseActivitySteps,
} from "@eva/shared/parseActivitySteps";
import { formatDuration } from "@eva/shared/duration";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import {
  silentStreamDelayMs,
  thinkingHeartbeatLabel,
  thinkingHeartbeatSeconds,
  visibleActivityKey,
} from "@/lib/components/streamingActivityHeartbeat";

/**
 * How long an empty-but-live activity payload is treated as ordinary startup
 * lag before the placeholder admits it is receiving nothing. Every turn opens
 * with a few empty writes, so a shorter grace period would cry wolf on healthy
 * runs; past a minute the silence is the story.
 */
const SILENT_STREAM_NOTICE_AFTER_SECONDS = 60;

function SimpleViewWorkingStatus({ startedAt }: { startedAt?: number }) {
  const elapsed = useElapsedSeconds(startedAt, true);
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Spinner size="sm" />
      <span>
        <Shimmer as="span" duration={2.5} spread={1.5}>
          Working for
        </Shimmer>{" "}
        <span className="tabular-nums">{formatElapsed(elapsed)}</span>
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
  const sinceLastOutput = useElapsedSeconds(
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

/**
 * Clock of last *visible* work. Reasoning-token updates leave this alone so
 * a long think still heartbeats instead of looking like a hang.
 */
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
}: {
  activity: string | undefined;
  isStreaming?: boolean;
  name?: string;
  icon?: ReactNode;
  thinkingLabel?: string;
  startedAt?: number;
  onOpenFile?: (path: string) => void;
}) {
  const simpleView = useSimpleView();
  const lastOutputAt = useLastVisibleOutputAt(activity, isStreaming, startedAt);
  const streamIsSilent = useSilentStreamNotice(
    activity,
    isStreaming,
    startedAt,
  );
  if (simpleView) {
    if (!isStreaming) return null;
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

  const steps = parseActivitySteps(activity);

  return (
    <ActivityTasks
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
    />
  );
}

export function ActivityLogDisplay({
  activityLog,
  name,
  icon,
  startedAt,
  finishedAt,
  finalText,
  onOpenFile,
}: {
  activityLog: string;
  name?: string;
  icon?: ReactNode;
  startedAt?: number;
  finishedAt?: number;
  finalText?: string;
  onOpenFile?: (path: string) => void;
}) {
  const simpleView = useSimpleView();
  const duration =
    startedAt && finishedAt ? formatDuration(startedAt, finishedAt) : undefined;

  if (simpleView) {
    return null;
  }

  const steps = parseActivitySteps(activityLog);

  if (steps) {
    return (
      <ActivityTasks
        steps={steps}
        name={name}
        icon={icon}
        duration={duration}
        finalText={finalText}
        onOpenFile={onOpenFile}
      />
    );
  }

  // No parseable steps: a text-only reply (no tools) has an empty activity log
  // ("[]"). Render nothing rather than a "View logs" accordion wrapping a bare
  // "[]". The raw fallback below is only for a genuinely non-empty, unparseable
  // log (kept for debugging odd payloads).
  const trimmedLog = activityLog.trim();
  if (trimmedLog === "" || trimmedLog === "[]") {
    return null;
  }

  return (
    <Reasoning defaultOpen={false}>
      <ReasoningTrigger getThinkingMessage={() => "View logs"} />
      <CollapsibleContent className="mt-4 text-sm text-muted-foreground">
        <pre className="whitespace-pre-wrap max-sm:wrap-break-word font-mono text-xs max-h-64 overflow-y-auto scroll-fade">
          {activityLog}
        </pre>
      </CollapsibleContent>
    </Reasoning>
  );
}
