import type { ChatUiTone } from "@eva/shared/generativeUi";

/** Badge variant per catalog tone. `neutral` stays quiet, not accented. */
export const BADGE_VARIANT: Record<
  ChatUiTone,
  "secondary" | "success" | "warning" | "destructive"
> = {
  neutral: "secondary",
  positive: "success",
  warning: "warning",
  danger: "destructive",
};

/** Text colour for a metric's value and a callout's rule. */
export const TONE_TEXT: Record<ChatUiTone, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

/** Callout fill. Tone-only, matching the no-decorative-hairline rule. */
export const TONE_SURFACE: Record<ChatUiTone, string> = {
  neutral: "bg-muted",
  positive: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-destructive/10",
};
