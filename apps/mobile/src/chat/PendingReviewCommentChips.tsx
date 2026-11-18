import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconMessage, IconX } from "@tabler/icons-react-native";
import { Pressable, Text, View } from "react-native";
import type { PendingLineComment } from "@/diff/prDiffStore";
import { useScheme } from "@/ui/theme";

/**
 * The web `PendingReviewCommentChips`: one chip per diff comment waiting for
 * the next prompt, `path range` with a message icon, in the web chip's
 * `rounded-md border bg-card`. A tap opens the chat's diff at that file, as
 * the web opens the Diffs tab; × takes the comment out. The web tooltip with
 * the comment text has no tap equivalent here: the diff shows it under its
 * line. 32 high; the slop makes each part 44.
 */
export function PendingReviewCommentChips({
  comments,
  onOpen,
  onRemove,
}: {
  comments: readonly PendingLineComment[];
  onOpen: (path: string) => void;
  onRemove: (id: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return comments.map((comment) => {
    const label = `${comment.path} ${comment.label}`;
    return (
      <View
        key={comment.id}
        className="h-8 max-w-full flex-row items-center rounded-md"
        style={{ borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${label} in the diff`}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => onOpen(comment.path)}
          className="min-w-0 shrink flex-row items-center gap-1 pl-2 active:opacity-70"
        >
          <IconMessage size={14} color={theme.mutedForeground} />
          <Text numberOfLines={1} className="shrink font-instrument-sans text-sm" style={{ color: theme.foreground }}>
            {label}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove comment on ${label}`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => onRemove(comment.id)}
          className="h-full w-8 items-center justify-center active:opacity-70"
        >
          <IconX size={12} color={theme.foreground} />
        </Pressable>
      </View>
    );
  });
}
