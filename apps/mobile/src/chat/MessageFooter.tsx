import { formatClockTime } from "@eva/shared/dayLabel";
import { IconCheck, IconGitFork, IconLink } from "@tabler/icons-react-native";
import { MessageAction, MessageActionsBar, MessageMeta, formatElapsed } from "@vvedantb/native-ui/ai";
import { palette } from "@vvedantb/native-ui/theme";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { useScheme } from "@/ui/theme";

export type Sentiment = "positive" | "negative";

/**
 * The row under a message, as Eva's web chat: copy (a check for 2s once
 * copied), copy link, fork from here, thumbs on agent replies, then the clock
 * ("10:21 PM · 1m" for a finished reply).
 */
export function MessageFooter({
  text,
  at,
  finishedAt,
  link,
  onFork,
  rating,
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
}) {
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const copy = async (what: "text" | "link") => {
    await Clipboard.setStringAsync(what === "text" ? text : link);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  const meta = finishedAt ? `${formatClockTime(finishedAt)} · ${formatElapsed((finishedAt - at) / 1000)}` : formatClockTime(at);
  return (
    <MessageActionsBar>
      <MessageAction
        kind="copy"
        label={copied === "text" ? "Copied" : "Copy message"}
        icon={copied === "text" ? SuccessCheck : undefined}
        onPress={() => void copy("text")}
      />
      <MessageAction
        icon={copied === "link" ? SuccessCheck : IconLink}
        label={copied === "link" ? "Link copied" : "Copy link to message"}
        onPress={() => void copy("link")}
      />
      {onFork ? <MessageAction icon={IconGitFork} label="Fork from here" onPress={onFork} /> : null}
      {rating ? (
        <>
          <MessageAction
            kind="like"
            selected={rating.sentiment === "positive"}
            onPress={() => rating.onRate(rating.sentiment === "positive" ? null : "positive")}
          />
          <MessageAction
            kind="dislike"
            selected={rating.sentiment === "negative"}
            onPress={() => rating.onRate(rating.sentiment === "negative" ? null : "negative")}
          />
        </>
      ) : null}
      <MessageMeta>{meta}</MessageMeta>
    </MessageActionsBar>
  );
}

/** The success-coloured check the web shows after a copy. */
function SuccessCheck(props: { size?: number | string }) {
  const scheme = useScheme();
  return <IconCheck {...props} color={palette.success[scheme]} />;
}
