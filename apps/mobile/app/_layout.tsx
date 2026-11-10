import "../global.css";
import { installUnhandledRejectionLogging } from "@/logging/unhandledRejections";

import { useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
  useFonts,
} from "@expo-google-fonts/instrument-sans";
import { AuthProviders } from "@vvedantb/native-ui/auth";
import { NativeUiProvider } from "@vvedantb/native-ui/theme";
import { Toaster } from "@vvedantb/native-ui/toast";
import { ConvexReactClient } from "convex/react";
import { type ErrorBoundaryProps, Slot, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useEffect, useState } from "react";
import { CONVEX_URL, PUBLISHABLE_KEY } from "@/config";
import { restoreColorSchemeChoice } from "@/settings/colorScheme";
import {
  isClerkNativeApiEnabled,
  NATIVE_API_DISABLED_MESSAGE,
} from "@/ui/clerkNativeApi";
import { applyEvaTheme } from "@/ui/evaTheme";
import { StartupFailure } from "@/ui/StartupFailure";
import { navigationTheme, useScheme } from "@/ui/theme";

// Release builds swallow unhandled rejections: log them first.
installUnhandledRejectionLogging();

// Eva's web colours for every native-ui part, before anything renders.
applyEvaTheme();

// The saved light / dark / system choice, applied before the first screen.
void restoreColorSchemeChoice();

/** One client for the app's life, outside render (it holds the socket). */
const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });

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
      <StartupFailure message={error.message} onRetry={() => void retry()} />
    </NativeUiProvider>
  );
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
  const fontsTimedOut = useTimedOut(FONT_TIMEOUT_MS);
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  if (!fontsLoaded && !fontError && !fontsTimedOut) return null;

  return (
    <AuthProviders loaded={false} publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} convex={convex}>
      <ThemeProvider value={navigationTheme(scheme)}>
        <NativeUiProvider>
          <ClerkGate>
            <Slot />
          </ClerkGate>
          <Toaster />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </NativeUiProvider>
      </ThemeProvider>
    </AuthProviders>
  );
}
