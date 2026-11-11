import { EVA_THEME } from "@eva/shared/evaTheme";
import type { NotificationIconName, NotificationTone } from "@eva/shared";
import {
  IconAlertTriangle,
  IconArchive,
  IconAt,
  IconCheck,
  IconExclamationCircle,
  IconFileExport,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconInfoCircle,
  IconMessage,
  IconMessageQuestion,
  IconMessageReply,
  IconPencil,
  IconPlayerPlay,
  IconProgress,
  IconRepeat,
  IconUserPlus,
  type IconProps,
} from "@tabler/icons-react-native";
import { palette, tokens, withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import type { Scheme } from "@/ui/theme";

/**
 * The React Native side of `@eva/shared/notificationAppearance`, which holds
 * each type's icon name, label and tone (the same map as the web inbox).
 */
export const NOTIFICATION_ICONS: Record<NotificationIconName, ComponentType<IconProps>> = {
  Repeat: IconRepeat,
  FileExport: IconFileExport,
  Check: IconCheck,
  UserPlus: IconUserPlus,
  Progress: IconProgress,
  Message: IconMessage,
  Pencil: IconPencil,
  MessageReply: IconMessageReply,
  At: IconAt,
  PlayerPlay: IconPlayerPlay,
  ExclamationCircle: IconExclamationCircle,
  AlertTriangle: IconAlertTriangle,
  InfoCircle: IconInfoCircle,
  Archive: IconArchive,
  GitMerge: IconGitMerge,
  GitPullRequestClosed: IconGitPullRequestClosed,
  MessageQuestion: IconMessageQuestion,
};

/**
 * A tone's glyph colour and avatar tint, as the web `text-<tone>` and
 * `bg-<tone>/10` (secondary and muted are the flat `bg-secondary` and `bg-muted`).
 */
export function toneColors(tone: NotificationTone, scheme: Scheme): { glyph: string; tint: string } {
  switch (tone) {
    case "secondary":
      return { glyph: palette.defaultForeground[scheme], tint: palette.default[scheme] };
    case "muted":
      return { glyph: tokens.color.muted[scheme], tint: EVA_THEME[scheme].muted };
    default: {
      const glyph = palette[tone === "destructive" ? "danger" : tone][scheme];
      return { glyph, tint: withAlpha(glyph, 0.1) };
    }
  }
}
