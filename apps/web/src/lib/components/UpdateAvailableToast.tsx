"use client";

import { useEffect } from "react";
import { startUpdateAvailableWatcher, toast } from "@vvedantb/ui";
import { convex } from "@/lib/convex";

/**
 * In the signed-in app shell, poll the live index HTML for a new Vite asset
 * fingerprint (and re-check when the tab becomes visible). Surfaces a sticky
 * toast with Refresh when a newer deploy is serving.
 */
export function UpdateAvailableToast() {
  useEffect(
    () =>
      startUpdateAvailableWatcher({
        origin: window.location.origin,
        toast,
        closeConvex: () => convex.close(),
        enabled: !import.meta.env.DEV,
      }),
    [],
  );

  return null;
}
