import { api, type Id } from "@eva/backend";
import { CLEAR_GOAL_COMMAND, goalDetail, goalStatusLabel } from "@eva/shared/agentGoal";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconTargetArrow, IconX } from "@tabler/icons-react-native";
import { Badge, Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * The web `GoalBanner` above the composer: Claude's native `/goal` for this
 * chat (the daemon mirrors it on the session chat), whether it is still
 * worked on or met, the last check, and Clear, which sends `/goal clear` as a
 * chat message. The daemon removes the banner when Claude confirms.
 */
export function GoalBanner({ chatId, target }: { chatId: Id<"sessionChats"> | undefined; target: string }) {
  const theme = EVA_THEME[useScheme()];
  // The same subscription as the background agents chip.
  const sessionChat = useQuery(api.sessionChats.get, chatId ? { chatId } : "skip");
  const send = useMutation(api.chats.send);
  const [clearing, setClearing] = useState(false);
  const goal = sessionChat?.goal;
  if (!goal) return null;

  const clear = () => {
    setClearing(true);
    // Chained, not try / finally, which React Compiler cannot compile.
    send({ target, message: CLEAR_GOAL_COMMAND, attachmentStorageIds: [] })
      .catch(() => toast.error("Couldn't send your message"))
      .then(() => setClearing(false));
  };

  return (
    // The usage-limit card's surface: `bg-muted`, radius 16, 12 in from the thread.
    <View className="mx-3 mb-2 flex-row items-start gap-2.5 rounded-2xl p-3" style={{ backgroundColor: theme.muted }}>
      <View className="mt-0.5">
        <IconTargetArrow size={18} color={theme.mutedForeground} />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-instrument-sans-medium text-xs" style={{ fontWeight: "500", color: theme.mutedForeground }}>
            Goal
          </Text>
          <Badge variant={goal.status === "complete" ? "success" : "secondary"} textClassName="text-xs">{goalStatusLabel(goal)}</Badge>
        </View>
        <Text numberOfLines={2} className="font-instrument-sans-medium text-sm" style={{ fontWeight: "500", color: theme.foreground }}>
          {goal.objective}
        </Text>
        <Text numberOfLines={1} className="font-instrument-sans text-xs" style={{ color: theme.mutedForeground }}>
          {goalDetail(goal)}
        </Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        fullWidth={false}
        loading={clearing}
        disabled={clearing}
        leftIcon={<IconX size={14} color={theme.foreground} />}
        onPress={clear}
      >
        Clear
      </Button>
    </View>
  );
}
