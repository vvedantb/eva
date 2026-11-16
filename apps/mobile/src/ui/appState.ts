import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

const subscribe = (listener: () => void) => {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
};

/** Whether the app is in the foreground (`AppState` "active"), as the web's tab visibility. */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, () => AppState.currentState === "active");
}
