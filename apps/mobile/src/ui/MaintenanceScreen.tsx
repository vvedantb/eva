import { api } from "@eva/backend";
import { tokens } from "@vvedantb/native-ui/theme";
import { useConvex } from "convex/react";
import { type ReactNode, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * True while the backend is in maintenance mode (`MAINTENANCE`, see
 * `convex/maintenance.ts`); `undefined` while loading or when the status
 * query fails. Not `useQuery`, which throws on a failed query: a backend
 * without `maintenance:status` (older than this app) would otherwise take the
 * whole app down with it. The query needs no sign-in.
 */
export function useMaintenanceMode(): boolean | undefined {
  const watch = useConvex().watchQuery(api.maintenance.status, {});
  return useSyncExternalStore(
    (onChange) => watch.onUpdate(onChange),
    () => {
      try {
        return watch.localQueryResult();
      } catch {
        return undefined;
      }
    },
  );
}

/**
 * The web `MaintenanceGate`: replaces the whole app while the backend is in
 * maintenance mode. Unmounting the app stops every `auth*` query from
 * throwing behind the screen; the status query is live and needs no sign-in,
 * so the app comes back on its own when maintenance ends. While the status
 * loads, the app renders rather than hold the first screen.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  return useMaintenanceMode() === true ? <MaintenanceScreen /> : children;
}

/** The web `MaintenanceScreen`: a card on the page background, the title and one line, centred. */
export function MaintenanceScreen() {
  const scheme = useScheme();
  return (
    <View
      className="flex-1 items-center justify-center p-4"
      style={{ backgroundColor: tokens.color.background[scheme] }}
      accessibilityRole="alert"
    >
      <View className="w-full max-w-md rounded-lg p-6" style={{ backgroundColor: tokens.color.surfaceCard[scheme] }}>
        <Text
          className="font-instrument-sans-semibold text-center text-lg"
          style={{ color: tokens.color.foreground[scheme], fontWeight: "600" }}
        >
          Eva is down for maintenance
        </Text>
        <Text className="font-instrument-sans mt-2 text-center text-sm" style={{ color: tokens.color.muted[scheme] }}>
          We are updating Eva. The app comes back on its own when we are done.
        </Text>
      </View>
    </View>
  );
}
