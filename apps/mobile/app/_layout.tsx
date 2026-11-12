import "../global.css";
import { installUnhandledRejectionLogging } from "@/logging/unhandledRejections";

import { useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { AuthProviders } from "@vvedantb/native-ui/auth";
import { GestureHandlerProvider } from "@vvedantb/native-ui/gesture-handler";
import { KeyboardControllerProvider } from "@vvedantb/native-ui/keyboard-controller";
import { NativeUiProvider } from "@vvedantb/native-ui/theme";
import { Toaster } from "@vvedantb/native-ui/toast";
import { isMaintenanceError } from "@eva/shared";
import { ConvexProvider } from "convex/react";
import { type ErrorBoundaryProps, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { CONVEX_URL, PUBLISHABLE_KEY } from "@/config";
import { StableConvexClient } from "@/convex/StableConvexClient";
import { restoreColorSchemeChoice } from "@/settings/colorScheme";
import {
  isClerkNativeApiEnabled,
  NATIVE_API_DISABLED_MESSAGE,
} from "@/ui/clerkNativeApi";
import { applyEvaTheme } from "@/ui/evaTheme";
import { EVA_FONT } from "@/ui/fonts";
import { MaintenanceGate, MaintenanceScreen, useMaintenanceMode } from "@/ui/MaintenanceScreen";
import { StartupFailure } from "@/ui/StartupFailure";
import { UpdateDialog } from "@/update/UpdateDialog";
import { checkForUpdate } from "@/update/updateCheck";
import { useStackScreenOptions } from "@/ui/stackOptions";
import { navigationTheme, useScheme } from "@/ui/theme";

// Release builds swallow unhandled rejections: log them first.
installUnhandledRejectionLogging();

// Eva's web colours for every native-ui part, before anything renders.
applyEvaTheme();

// The saved light / dark / system choice, applied before the first screen.
void restoreColorSchemeChoice();

// A newer APK on GitHub Releases, offered once the app is up (`UpdateDialog`).
void checkForUpdate();

/**
 * One client for the app's life, outside render (it holds the socket). Its
 * results keep their identity while their data is the same, so a reconnect
 * on resume does not redraw every list (`StableConvexClient`).
 */
const convex = new StableConvexClient(CONVEX_URL, { unsavedChangesWarning: false });

/** Fonts wait at most this long, then the app starts with system fonts. */
const FONT_TIMEOUT_MS = 3_000;
/** Clerk gets this long to load before the app shows a failure screen. */
const CLERK_TIMEOUT_MS = 15_000;

/** True once `ms` pass. Clerk load errors are rejected promises, so no error boundary sees them. */
function useTimedOut(ms: number): boolean {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return timedOut;
}

/** Render errors in any screen land here (expo-router picks up this export). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <NativeUiProvider>
      {isMaintenanceError(error) ? (
        // The layout's providers are gone here, so the status query gets its own (no sign-in needed).
        <ConvexProvider client={convex}>
          <MaintenanceFallback onEnded={() => void retry()} />
        </ConvexProvider>
      ) : (
        <StartupFailure message={error.message} onRetry={() => void retry()} />
      )}
    </NativeUiProvider>
  );
}

/**
 * A screen threw the backend's maintenance error before `MaintenanceGate`
 * saw the status: the maintenance screen, then the app again on its own once
 * the status says maintenance is over.
 */
function MaintenanceFallback({ onEnded }: { onEnded: () => void }) {
  const inMaintenance = useMaintenanceMode();
  // Effect: the end of maintenance is a server event, and `retry` remounts the app.
  useEffect(() => {
    if (inMaintenance === false) onEnded();
  }, [inMaintenance, onEnded]);
  return <MaintenanceScreen />;
}

/**
 * Children wait for Clerk. Clerk rejects native clients with a promise (not a
 * render throw), so we also probe `/v1/environment` and time out to a visible
 * failure instead of a blank screen.
 */
function ClerkGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth();
  const timedOut = useTimedOut(CLERK_TIMEOUT_MS);
  const [nativeApiDisabled, setNativeApiDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isClerkNativeApiEnabled().then((enabled) => {
      if (!cancelled && enabled === false) setNativeApiDisabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoaded) return children;
  if (nativeApiDisabled) {
    return <StartupFailure message={NATIVE_API_DISABLED_MESSAGE} />;
  }
  if (!timedOut) return null;
  return (
    <StartupFailure message="Sign-in did not load. Check your connection. If the problem stays, enable Configure → Native applications in the Clerk Dashboard for Eva, then install a new APK. Run `adb logcat -s ReactNativeJS` for the exact error." />
  );
}

export default function RootLayout() {
  const scheme = useScheme();
  const stackOptions = useStackScreenOptions();
  const fontsTimedOut = useTimedOut(FONT_TIMEOUT_MS);
  // Inter under the names the classes and JS styles use (`@/ui/fonts`).
  const [fontsLoaded, fontError] = useFonts({
    [EVA_FONT.regular]: Inter_400Regular,
    [EVA_FONT.medium]: Inter_500Medium,
    [EVA_FONT.semibold]: Inter_600SemiBold,
    [EVA_FONT.bold]: Inter_700Bold,
  });
  if (!fontsLoaded && !fontError && !fontsTimedOut) return null;

  return (
    // Gesture Handler for the whole app; the kit's sheets drag on it, on the
    // UI thread (each sheet's `Modal` adds its own root view). The keyboard's
    // real position, frame by frame, for the kit's composer, transcript and
    // forms (`KeyboardControllerProvider`).
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <KeyboardControllerProvider>
          <GestureHandlerProvider>
            <AuthProviders loaded={false} publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} convex={convex}>
              <ThemeProvider value={navigationTheme(scheme)}>
                <NativeUiProvider>
                  {/* Maintenance replaces the app, signed in or not (its status needs no sign-in). */}
                  <MaintenanceGate>
                    <ClerkGate>
                      {/* A stack, not a `Slot`: a `Slot` unmounts the tabs under a pushed chat and
                          drops their state, so Back landed on the Inbox, not the tab it came from.
                          A push deeper (a chat, a review, a new session) runs the platform's own
                          transition (`useStackScreenOptions`). */}
                      <Stack screenOptions={stackOptions} />
                    </ClerkGate>
                  </MaintenanceGate>
                  <UpdateDialog />
                  <Toaster />
                  <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                </NativeUiProvider>
              </ThemeProvider>
            </AuthProviders>
          </GestureHandlerProvider>
        </KeyboardControllerProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
