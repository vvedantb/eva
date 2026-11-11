import { GlassBlurTarget } from "@vvedantb/native-ui/floating";
import { useIsFocused } from "expo-router";
import type { ReactNode } from "react";

/**
 * Tab content is the blur target of the floating tab bar on Android
 * (expo-blur 55+ needs one). The focused tab wins.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return <GlassBlurTarget active={focused}>{children}</GlassBlurTarget>;
}
