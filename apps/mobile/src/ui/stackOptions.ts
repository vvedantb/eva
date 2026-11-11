import { useReducedMotion } from "react-native-reanimated";

/**
 * Every stack's screen options: no header (each screen draws its own), and a
 * push runs the platform's own transition. With Reduce Motion, screens
 * cross-fade instead. Tabs switch at once inside `(tabs)`.
 */
export function useStackScreenOptions(): { headerShown: false; animation: "default" | "fade" } {
  return { headerShown: false, animation: useReducedMotion() ? "fade" : "default" };
}
