"use client";

import { Toaster } from "@vvedantb/ui";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * Global toast host. Reads the resolved app theme so sonner matches
 * light/dark, and pins toasts to the top-right corner.
 */
export function AppToaster() {
  const { resolvedTheme } = useThemeMode();
  return <Toaster theme={resolvedTheme} position="top-right" />;
}
