import { findAIModelOption, getReasoningLevelLabel } from "@eva/backend";
import { formatClockTime } from "@eva/shared/dayLabel";
import { formatDuration } from "@eva/shared/duration";
import { MessageActionsBar, MessageMeta } from "@vvedantb/native-ui/ai";
import { ProviderIcon } from "@vvedantb/native-ui/brand";
import type { ReactNode } from "react";
import { View } from "react-native";

export type Sentiment = "positive" | "negative";

/**
 * The row under a message: the provider mark of the turn's model on an agent
 * reply, then the clock ("10:21 PM · 1m" for a finished reply, the web
 * `formatDuration`, at the 12 caption size). The web footer's actions (copy,
 * copy link, fork, thumbs) are in the message's hold menu on the phone
 * (`MessageHoldMenu`, user choice), so this row only says when.
 */
export function MessageFooter({
  at,
  finishedAt,
  turn,
  className,
  leading,
}: {
  at: number;
  finishedAt?: number;
  turn?: { model?: string; reasoningLevel?: string; credentialSourceLabel?: string };
  className?: string;
  leading?: ReactNode;
}) {
  const meta = finishedAt ? `${formatClockTime(finishedAt)} · ${formatDuration(at, finishedAt)}` : formatClockTime(at);
  return (
    <MessageActionsBar className={`gap-1.5 ${className ?? ""}`}>
      {leading}
      {turn?.model ? <ModelIcon {...turn} model={turn.model} /> : null}
      <MessageMeta>{meta}</MessageMeta>
    </MessageActionsBar>
  );
}

/**
 * The provider mark (12, or the queue row's 14) in a 16 box, as the web
 * `MessageModelIcon`. Its accessible name is the web tooltip's model, effort
 * and account, without the provider prefix the web adds to the model
 * (`formatModelDisplayLabel`).
 */
export function ModelIcon({
  model,
  reasoningLevel,
  credentialSourceLabel,
  size = 12,
}: {
  model: string;
  reasoningLevel?: string;
  credentialSourceLabel?: string;
  size?: 12 | 14;
}) {
  const option = findAIModelOption(model);
  const title = [option.label, reasoningLevel ? getReasoningLevelLabel(reasoningLevel) : undefined, credentialSourceLabel]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className="size-4 shrink-0 items-center justify-center">
      <ProviderIcon provider={option.provider} size={size} title={title} />
    </View>
  );
}
