import type { UsageTone } from "@eva/shared/usageLimits";

/** Text colour for a tone. One place, so chip and rows cannot disagree. */
export const USAGE_TONE_TEXT_CLASS: Record<UsageTone, string> = {
  neutral: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-destructive",
};

/** Bar fill for a tone. `primary` is user-themed, so it is never hardcoded. */
export const USAGE_TONE_FILL_CLASS: Record<UsageTone, string> = {
  neutral: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
};
