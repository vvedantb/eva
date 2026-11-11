import { findAIModelOption, getReasoningLevelLabel } from "@eva/backend";
import { formatClockTime } from "@eva/shared/dayLabel";
import { formatDuration } from "@eva/shared/duration";
import { IconCheck, IconGitFork, IconLink } from "@tabler/icons-react-native";
import { MessageAction, MessageActionsBar, MessageMeta } from "@vvedantb/native-ui/ai";
import { ProviderIcon } from "@vvedantb/native-ui/brand";
import { palette } from "@vvedantb/native-ui/theme";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { useScheme } from "@/ui/theme";

export type Sentiment = "positive" | "negative";

/**
 * The row under a message, as Eva's web chat: the provider mark of the turn's
 * model on an agent reply, copy (a check for 2s once copied), copy link, fork
 * from here, thumbs on agent replies, then the clock
 * ("10:21 PM · 1m" for a finished reply, the web `formatDuration`). The web
 * `icon-xs` buttons (28, 14 icons) sit 2 apart; the groups and the clock are
 * 8 apart on a reply (`gap-2`) and 12 on a user message (`gap-3`).
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
    <MessageActionsBar className={`${rating ? "mt-0.5 gap-2" : "gap-3"} ${className ?? ""}`}>
      {turn?.model ? <ModelIcon {...turn} model={turn.model} /> : null}
      <MessageActionsBar className={rating ? "ml-0.5 gap-0.5" : "gap-0.5"}>
        <MessageAction
          kind="copy"
          size="xs"
          label={copied === "text" ? "Copied" : "Copy message"}
          icon={copied === "text" ? SuccessCheck : undefined}
          onPress={() => void copy("text")}
        />
        <MessageAction
          size="xs"
          icon={copied === "link" ? SuccessCheck : IconLink}
          label={copied === "link" ? "Link copied" : "Copy link to message"}
          onPress={() => void copy("link")}
        />
        {onFork ? <MessageAction size="xs" icon={IconGitFork} label="Fork from here" onPress={onFork} /> : null}
      </MessageActionsBar>
      {rating ? (
        <MessageActionsBar className="gap-0.5">
          <MessageAction
            kind="like"
            size="xs"
            selected={rating.sentiment === "positive"}
            onPress={() => rating.onRate(rating.sentiment === "positive" ? null : "positive")}
          />
          <MessageAction
            kind="dislike"
            size="xs"
            selected={rating.sentiment === "negative"}
            onPress={() => rating.onRate(rating.sentiment === "negative" ? null : "negative")}
          />
        </MessageActionsBar>
      ) : null}
      <MessageMeta size="2xs">{meta}</MessageMeta>
    </MessageActionsBar>
  );
}

/**
 * The 12 provider mark in a 16 box, as the web `MessageModelIcon`. Its
 * accessible name is the web tooltip's model, effort and account, without the
 * provider prefix the web adds to the model (`formatModelDisplayLabel`).
 */
function ModelIcon({
  model,
  reasoningLevel,
  credentialSourceLabel,
}: {
  model: string;
  reasoningLevel?: string;
  credentialSourceLabel?: string;
}) {
  const option = findAIModelOption(model);
  const title = [option.label, reasoningLevel ? getReasoningLevelLabel(reasoningLevel) : undefined, credentialSourceLabel]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className="size-4 shrink-0 items-center justify-center">
      <ProviderIcon provider={option.provider} size={12} title={title} />
    </View>
  );
}

/** The success-coloured check the web shows after a copy. */
function SuccessCheck(props: { size?: number | string }) {
  const scheme = useScheme();
  return <IconCheck {...props} color={palette.success[scheme]} />;
}
