import type { DisplayTaskStatus } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconCircle,
  IconCircleCheck,
  IconCircleX,
  IconClipboardCheck,
  IconClock,
  IconEye,
  type IconProps,
} from "@tabler/icons-react-native";
import type { ComponentType } from "react";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { Scheme } from "@/ui/theme";

/**
 * The web `statusConfig` (`TaskStatusBadge.tsx`) for the phone: each status's
 * icon, its text colour (section headers) and its row stripe colour.
 */
const STATUS_ICONS: Record<DisplayTaskStatus, ComponentType<IconProps>> = {
  todo: IconCircle,
  in_progress: IconClock,
  business_review: IconClipboardCheck,
  code_review: IconEye,
  done: IconCircleCheck,
  cancelled: IconCircleX,
};

export function statusAppearance(status: DisplayTaskStatus, scheme: Scheme) {
  const theme = EVA_THEME[scheme];
  const colours: Record<DisplayTaskStatus, { text: string; bar: string }> = {
    // Web: `text-muted-foreground`, stripe `bg-foreground/50`.
    todo: { text: theme.mutedForeground, bar: withAlpha(theme.foreground, 0.5) },
    in_progress: { text: theme.statusProgress, bar: theme.statusProgressBar },
    business_review: { text: theme.statusBusinessReview, bar: theme.statusBusinessReviewBar },
    code_review: { text: theme.statusCodeReview, bar: theme.statusCodeReviewBar },
    done: { text: theme.statusDone, bar: theme.statusDoneBar },
    cancelled: { text: theme.statusCancelled, bar: theme.statusCancelledBar },
  };
  return { icon: STATUS_ICONS[status], ...colours[status] };
}
