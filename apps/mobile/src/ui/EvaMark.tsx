import { EVA_MARK_BLUE, EVA_MARK_BOTTOM_POINTS, EVA_MARK_PURPLE, EVA_MARK_TOP_POINTS } from "@eva/shared/evaMark";
import Svg, { Polygon } from "react-native-svg";

/** Eva's two-tone star, as the web `EvaIcon` without its disc (same shared geometry). */
export function EvaMark({ size = 40 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 512 512" width={size} height={size} accessibilityRole="image" accessibilityLabel="Eva">
      <Polygon points={EVA_MARK_TOP_POINTS} fill={EVA_MARK_PURPLE} />
      <Polygon points={EVA_MARK_BOTTOM_POINTS} fill={EVA_MARK_BLUE} />
    </Svg>
  );
}
