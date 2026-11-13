import { findAIModelOption, getReasoningLevelLabel } from "@eva/backend";
import { formatClockTime } from "@eva/shared/dayLabel";
import { formatDuration } from "@eva/shared/duration";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCheck, IconGitFork, IconLink } from "@tabler/icons-react-native";
import { MessageAction, MessageActionsBar, MessageMeta } from "@vvedantb/native-ui/ai";
import { ProviderIcon } from "@vvedantb/native-ui/brand";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { useScheme } from "@/ui/theme";

export type Sentiment = "positive" | "negative";

/**
 * The row under a message, as Eva's web chat: the provider mark of the turn's
 * model on an agent reply, copy (a check for 2s once copied), copy link, fork
 * from here, thumbs on agent replies, then the clock
 * ("10:21 PM · 1m" for a finished reply, the web `formatDuration`, at the
 * 12 caption size). The buttons are whole 44 squares (`touch`, 16 icons) side
 * by side, so no tap lands on a neighbour; the web `icon-xs` 28s 2 apart are a
 * mouse's density. The groups and the clock are 4 apart on a reply (web
 * `gap-2`, so the wider buttons leave the clock room) and 12 on a user
 * message (`gap-3`). A long clock ("3:06 PM · 1h 23m") wraps whole to its own
 * line rather than breaking.
 */
export function MessageFooter({
  text,
  at,
  finishedAt,
  link,
  onFork,
  rating,
  turn,
  className,
}: {
  text: string;
  at: number;
  finishedAt?: number;
  /** The message's web permalink, copied by Copy link. */
  link: string;
  /** Start a new session from the transcript up to this message. */
  onFork?: () => void;
  /** Agent replies: the viewer's thumbs and the setter (`null` clears). */
  rating?: { sentiment: Sentiment | undefined; onRate: (sentiment: Sentiment | null) => void };
  /** Agent replies: the user turn before it (`buildPrecedingUserTurns`), which holds the model it ran on. */
  turn?: { model?: string; reasoningLevel?: string; credentialSourceLabel?: string };
  /** Extra classes for the row, such as a teammate's inset. */
  className?: string;
}) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const copy = async (what: "text" | "link") => {
    await Clipboard.setStringAsync(what === "text" ? text : link);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  const meta = finishedAt ? `${formatClockTime(finishedAt)} · ${formatDuration(at, finishedAt)}` : formatClockTime(at);
  return (
    <MessageActionsBar className={`flex-wrap ${rating ? "gap-1" : "gap-3"} ${className ?? ""}`}>
      {turn?.model ? <ModelIcon {...turn} model={turn.model} /> : null}
      <MessageActionsBar className="gap-0">
        <MessageAction
          kind="copy"
          size="touch"
          label={copied === "text" ? "Copied" : "Copy message"}
          icon={copied === "text" ? SuccessCheck : undefined}
          onPress={() => void copy("text")}
        />
        <MessageAction
          size="touch"
          icon={copied === "link" ? SuccessCheck : IconLink}
          label={copied === "link" ? "Link copied" : "Copy link to message"}
          onPress={() => void copy("link")}
        />
        {onFork ? <MessageAction size="touch" icon={IconGitFork} label="Fork from here" onPress={onFork} /> : null}
      </MessageActionsBar>
      {rating ? (
        <MessageActionsBar className="gap-0">
          <MessageAction
            kind="like"
            size="touch"
            selected={rating.sentiment === "positive"}
            onPress={() => rating.onRate(rating.sentiment === "positive" ? null : "positive")}
          />
          <MessageAction
            kind="dislike"
            size="touch"
            selected={rating.sentiment === "negative"}
            onPress={() => rating.onRate(rating.sentiment === "negative" ? null : "negative")}
          />
        </MessageActionsBar>
      ) : null}
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

/** The success-coloured check the web shows after a copy. */
function SuccessCheck(props: { size?: number | string }) {
  const scheme = useScheme();
  return <IconCheck {...props} color={EVA_THEME[scheme].success} />;
}
