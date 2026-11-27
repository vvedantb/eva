import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconAlertCircle, IconAlertTriangle } from "@tabler/icons-react-native";
import { META_TEXT_STYLE } from "@vvedantb/native-ui/ai";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TimeAgo } from "@/ui/TimeAgo";
import { useScheme } from "@/ui/theme";

type Tone = { Icon: typeof IconAlertTriangle; color: "warning" | "destructive"; action: string; title: string };

const TONES: { warning: Tone; error: Tone } = {
  warning: { Icon: IconAlertTriangle, color: "warning", action: "View details", title: "Sandbox Warning" },
  error: { Icon: IconAlertCircle, color: "destructive", action: "View error", title: "Sandbox Error" },
};

/**
 * A system row in the transcript, as the web `SystemAlertMessage`: the text
 * centred between two hairlines with its time, for a handoff ("Handed off
 * from X to Y") or a refusal. A warning (`alertTone`) or an error (an
 * `errorDetail`) adds its icon and a "View details" / "View error" link that
 * opens the full text. Start, stop and reconnect rows never reach it
 * (`visibleChatMessages`).
 */
export function SystemAlertRow({
  content,
  errorDetail,
  alertTone,
  timestamp,
}: {
  content: string;
  errorDetail?: string;
  alertTone?: "warning";
  timestamp?: number;
}) {
  const theme = EVA_THEME[useScheme()];
  const [showDetail, setShowDetail] = useState(false);
  const tone = alertTone === "warning" ? TONES.warning : errorDetail ? TONES.error : undefined;
  const toneColor = tone ? theme[tone.color] : undefined;
  const muted = theme.mutedForeground;
  return (
    <>
      <View accessibilityRole="text" className="flex-row items-center gap-3 py-1">
        <View className="h-px flex-1" style={{ backgroundColor: theme.border }} />
        <View className="max-w-[70%] flex-row items-center gap-1.5">
          {tone ? <tone.Icon size={14} color={toneColor} /> : null}
          <Text numberOfLines={1} className="shrink font-instrument-sans-medium" style={[META_TEXT_STYLE, { color: muted, fontWeight: "500" }]}>
            {content}
          </Text>
          {timestamp !== undefined ? (
            <>
              <Text style={[META_TEXT_STYLE, { color: withAlpha(muted, 0.7) }]}>·</Text>
              <TimeAgo at={timestamp} className="font-instrument-sans" style={{ ...META_TEXT_STYLE, color: withAlpha(muted, 0.7) }} />
            </>
          ) : null}
        </View>
        {errorDetail && tone ? (
          <Pressable accessibilityRole="button" onPress={() => setShowDetail(true)} hitSlop={12} className="active:opacity-70">
            <Text className="font-instrument-sans-medium" style={[META_TEXT_STYLE, { color: toneColor, fontWeight: "500" }]}>
              {tone.action}
            </Text>
          </Pressable>
        ) : null}
        <View className="h-px flex-1" style={{ backgroundColor: theme.border }} />
      </View>
      {errorDetail && tone ? (
        <Dialog open={showDetail} onOpenChange={setShowDetail}>
          <DialogContent>
            <DialogHeader>
              <View className="flex-row items-center gap-2">
                <tone.Icon size={16} color={toneColor} />
                <DialogTitle>{tone.title}</DialogTitle>
              </View>
            </DialogHeader>
            <ScrollView className="max-h-64 rounded-2xl p-4" style={{ backgroundColor: theme.muted }}>
              <Text selectable className="font-instrument-sans text-sm" style={{ color: muted }}>
                {errorDetail}
              </Text>
            </ScrollView>
            <DialogFooter>
              <Button variant="ghost" onPress={() => setShowDetail(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
