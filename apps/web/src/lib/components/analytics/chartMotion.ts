import { useDisablePageMotion } from "@/lib/components/PageMotionProvider";

/**
 * Chart.js default duration is ~1000ms and uses a different ease than the rest
 * of the app. Pin both to `--motion-slow` / a decelerating quart so stats
 * charts land on the same beat as KPI count-up and list stagger.
 */
export const CHART_ANIMATION = {
  duration: 320,
  easing: "easeOutQuart",
} as const;

/** `false` when the experimental page-motion gate is on. */
export function useChartAnimation(): typeof CHART_ANIMATION | false {
  return useDisablePageMotion() ? false : CHART_ANIMATION;
}
