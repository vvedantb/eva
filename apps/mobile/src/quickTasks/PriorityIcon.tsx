import { PRIORITY_LABELS, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { withAlpha } from "@vvedantb/native-ui/theme";
import Svg, { Rect } from "react-native-svg";
import { useScheme } from "@/ui/theme";

/** Tailwind `orange-500`, the web urgent square. */
const URGENT = "#f97316";

const BARS = [
  { x: 2, y: 11, h: 3 },
  { x: 6.5, y: 8, h: 6 },
  { x: 11, y: 5, h: 9 },
];

/**
 * The web `PriorityIcon` on a 16 grid: three flat dashes for none, an orange
 * square with "!" for urgent, else three rising bars filled up to the level.
 */
export function PriorityIcon({ level, size = 14 }: { level: Priority | undefined; size?: number }) {
  const theme = EVA_THEME[useScheme()];
  const label = level ? PRIORITY_LABELS[level] : "No priority";
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityLabel={`Priority: ${label}`}>
      {level === undefined ? (
        [2, 6.5, 11].map((x) => (
          <Rect key={x} x={x} y={7.25} width={3} height={1.5} rx={0.5} fill={withAlpha(theme.mutedForeground, 0.6)} />
        ))
      ) : level === "urgent" ? (
        <>
          <Rect x={1} y={1} width={14} height={14} rx={3} fill={URGENT} />
          <Rect x={7.25} y={4} width={1.5} height={5} rx={0.5} fill="#ffffff" />
          <Rect x={7.25} y={10.5} width={1.5} height={1.5} rx={0.5} fill="#ffffff" />
        </>
      ) : (
        BARS.map((bar, index) => (
          <Rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width={3}
            height={bar.h}
            rx={0.5}
            fill={index < (level === "high" ? 3 : level === "medium" ? 2 : 1) ? theme.foreground : withAlpha(theme.mutedForeground, 0.3)}
          />
        ))
      )}
    </Svg>
  );
}
