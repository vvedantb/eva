import type { PrOverview, StatusTone } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  IconCircleCheck,
  IconCircleX,
  IconGitMerge,
  IconGitPullRequest,
  IconGitPullRequestClosed,
  IconGitPullRequestDraft,
  IconMinus,
  type IconProps,
} from "@tabler/icons-react-native";
import { Spinner } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import type { ComponentType } from "react";
import type { Scheme } from "@/ui/theme";

/** Tailwind's emerald and violet, the web review colours (`emerald-600`, `violet-700`, ...). */
const EMERALD = { 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857" } as const;
const VIOLET = { 300: "#c4b5fd", 500: "#8b5cf6", 700: "#6d28d9" } as const;

/**
 * The web `statusMeta`: the lifecycle's word, glyph, text colour and the
 * state pill's 10% fill (merged violet, closed red, draft muted, open emerald).
 */
export function prStatusAppearance(
  status: PrOverview["status"],
  draft: boolean,
  scheme: Scheme,
): { label: string; text: string; fill: string; icon: ComponentType<IconProps> } {
  const theme = EVA_THEME[scheme];
  if (status === "merged") {
    const text = scheme === "dark" ? VIOLET[300] : VIOLET[700];
    return { label: "Merged", text, fill: withAlpha(VIOLET[500], 0.1), icon: IconGitMerge };
  }
  if (status === "closed") {
    return { label: "Closed", text: theme.destructive, fill: withAlpha(theme.destructive, 0.1), icon: IconGitPullRequestClosed };
  }
  if (draft) {
    return { label: "Draft", text: theme.mutedForeground, fill: withAlpha(theme.muted, 0.6), icon: IconGitPullRequestDraft };
  }
  const text = scheme === "dark" ? EMERALD[300] : EMERALD[700];
  return { label: "Open", text, fill: withAlpha(EMERALD[500], 0.1), icon: IconGitPullRequest };
}

/** The web Reviews list icon: emerald for an open, ready pull request, muted otherwise. */
export function prListIconColour(pr: { state: "open" | "closed"; draft: boolean }, scheme: Scheme): string {
  return toneColour(pr.draft || pr.state !== "open" ? "neutral" : "success", scheme);
}

/** The colour of each tone: the web `text-emerald-600` (dark 400), `text-destructive` and muted. */
export function toneColour(tone: StatusTone, scheme: Scheme): string {
  if (tone === "success") return scheme === "dark" ? EMERALD[400] : EMERALD[600];
  if (tone === "failure") return EVA_THEME[scheme].destructive;
  return EVA_THEME[scheme].mutedForeground;
}

/** The web `ToneIcon`: a spinner while pending, else a check, a cross or a dash. */
export function ToneIcon({ tone, scheme, size = 14 }: { tone: StatusTone; scheme: Scheme; size?: number }) {
  if (tone === "pending") return <Spinner size="sm" decorative />;
  const Icon = tone === "success" ? IconCircleCheck : tone === "failure" ? IconCircleX : IconMinus;
  return <Icon size={size} color={toneColour(tone, scheme)} />;
}
