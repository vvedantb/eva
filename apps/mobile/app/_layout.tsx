import "../global.css";
import { installUnhandledRejectionLogging } from "@/logging/unhandledRejections";
import { loadLastCrash, saveLastCrash } from "@/logging/lastCrash";

import { useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
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
import { WindowLayerHost } from "@vvedantb/native-ui/primitives";
import { PasteInputProvider } from "@vvedantb/native-ui/paste-input";
import { NativeUiProvider } from "@vvedantb/native-ui/theme";
import { Toaster } from "@vvedantb/native-ui/toast";
import { isMaintenanceError } from "@eva/shared";
import { ConvexProvider } from "convex/react";
import { type ErrorBoundaryProps, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { CONVEX_URL, PUBLISHABLE_KEY } from "@/config";
import { StableConvexClient } from "@/convex/StableConvexClient";
import { restoreThemeMode } from "@/settings/themeMode";
import {
  isClerkNativeApiEnabled,
  NATIVE_API_DISABLED_MESSAGE,
} from "@/ui/clerkNativeApi";
import { applyEvaTheme, NEUTRAL_CLASS_VARS } from "@/ui/evaTheme";
import { EVA_FONT } from "@/ui/fonts";
import { MaintenanceGate, MaintenanceScreen, useMaintenanceMode } from "@/ui/MaintenanceScreen";
import { StartupFailure } from "@/ui/StartupFailure";
import { UpdateDialog } from "@/update/UpdateDialog";
import { LastCrashDialog } from "@/logging/LastCrashDialog";
import { useStackScreenOptions } from "@/ui/stackOptions";
import { navigationTheme, useScheme } from "@/ui/theme";

installUnhandledRejectionLogging(globalThis, { onFatal: saveLastCrash });
void loadLastCrash();

applyEvaTheme();

void restoreThemeMode();

const convex = new StableConvexClient(CONVEX_URL, { unsavedChangesWarning: false });

const FONT_TIMEOUT_MS = 3_000;
const CLERK_TIMEOUT_MS = 15_000;

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
        <ConvexProvider client={convex}>
          <MaintenanceFallback onEnded={() => void retry()} />
        </ConvexProvider>
      ) : (
        <StartupFailure message={error.message} onRetry={() => void retry()} />
      )}
    </NativeUiProvider>
  );
}

function MaintenanceFallback({ onEnded }: { onEnded: () => void }) {
  const inMaintenance = useMaintenanceMode();
  useEffect(() => {
    if (inMaintenance === false) onEnded();
  }, [inMaintenance, onEnded]);
  return <MaintenanceScreen />;
}

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
  const [fontsLoaded, fontError] = useFonts({
    [EVA_FONT.regular]: Inter_400Regular,
    [EVA_FONT.medium]: Inter_500Medium,
    [EVA_FONT.semibold]: Inter_600SemiBold,
    [EVA_FONT.bold]: Inter_700Bold,
  });
  if (!fontsLoaded && !fontError && !fontsTimedOut) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <View className="flex-1" style={scheme === "neutral" ? NEUTRAL_CLASS_VARS : undefined}>
        <KeyboardProvider>
          <KeyboardControllerProvider>
            <PasteInputProvider>
            <GestureHandlerProvider>
              <AuthProviders loaded={false} publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} convex={convex}>
                <ThemeProvider value={navigationTheme(scheme)}>
                  <NativeUiProvider>
                    <MaintenanceGate>
                      <ClerkGate>
                        <WindowLayerHost>
                          <Stack screenOptions={stackOptions} />
                        </WindowLayerHost>
                      </ClerkGate>
                    </MaintenanceGate>
                    <UpdateDialog />
                    <LastCrashDialog />
                    <Toaster />
                    <StatusBar style={scheme === "light" ? "dark" : "light"} />
                  </NativeUiProvider>
                </ThemeProvider>
              </AuthProviders>
            </GestureHandlerProvider>
            </PasteInputProvider>
          </KeyboardControllerProvider>
        </KeyboardProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
