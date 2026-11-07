import { formatClockTime } from "@eva/shared/dayLabel";
import { IconCheck } from "@tabler/icons-react-native";
import { MessageAction, MessageActionsBar, MessageMeta, formatElapsed } from "@vvedantb/native-ui/ai";
import { palette } from "@vvedantb/native-ui/theme";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { useScheme } from "@/ui/theme";

/**
 * The row under a message, as Eva's web chat: copy (a check for 2s once
 * copied, the web `CrossfadeIcon`), then the clock. A finished agent reply
 * shows when it finished and how long it took ("10:21 PM · 1m").
 * Link, fork and rating are web features the app does not have yet.
 */
export function MessageFooter({ text, at, finishedAt }: { text: string; at: number; finishedAt?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const meta = finishedAt ? `${formatClockTime(finishedAt)} · ${formatElapsed((finishedAt - at) / 1000)}` : formatClockTime(at);
  return (
    <MessageActionsBar>
      <MessageAction
        kind="copy"
        label={copied ? "Copied" : "Copy message"}
        icon={copied ? SuccessCheck : undefined}
        onPress={() => void copy()}
      />
      <MessageMeta>{meta}</MessageMeta>
    </MessageActionsBar>
  );
}

/** The success-coloured check the web shows after a copy. */
function SuccessCheck(props: { size?: number | string }) {
  const scheme = useScheme();
  return <IconCheck {...props} color={palette.success[scheme]} />;
}
