import "../global.css";

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
import { Slot, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { CONVEX_URL, PUBLISHABLE_KEY } from "@/config";
import { navigationTheme, useScheme } from "@/ui/theme";

/** One client for the app's life, outside render (it holds the socket). */
const convex = new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false });

export default function RootLayout() {
  const scheme = useScheme();
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });
  if (!fontsLoaded) return null;

  return (
    <AuthProviders publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} convex={convex}>
      <ThemeProvider value={navigationTheme(scheme)}>
        <NativeUiProvider>
          <Slot />
          <Toaster />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </NativeUiProvider>
      </ThemeProvider>
    </AuthProviders>
  );
}
