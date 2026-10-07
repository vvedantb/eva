"use client";

import { useEffect } from "react";
import { toast } from "@eva/ui";
import { convex } from "@/lib/convex";
import { fetchDeployFingerprint } from "@/lib/utils/deployFingerprint";

const POLL_MS = 60_000;
const TOAST_ID = "app-update-available";

let updateToastShown = false;

function reloadForUpdate() {
  try {
    convex.close();
  } catch {
    // WebSocket may already be closed
  }
  window.location.reload();
}

function showUpdateToast() {
  if (updateToastShown) return;
  updateToastShown = true;
  toast.message("Update available", {
    id: TOAST_ID,
    description: "Refresh to load the latest version.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Refresh",
      onClick: () => {
        reloadForUpdate();
      },
    },
  });
}

/**
 * In the signed-in app shell, poll the live index HTML for a new Vite asset
 * fingerprint (and re-check when the tab becomes visible). Surfaces a sticky
 * toast with Refresh when a newer deploy is serving.
 */
export function UpdateAvailableToast() {
  useEffect(() => {
    if (import.meta.env.DEV) return;

    let cancelled = false;
    let baseline: string | null = null;

    const check = async () => {
      if (cancelled || updateToastShown) return;
      const next = await fetchDeployFingerprint(window.location.origin);
      if (cancelled || next === null) return;
      if (baseline === null) {
        baseline = next;
        return;
      }
      if (next !== baseline) {
        showUpdateToast();
      }
    };

    void check();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void check();
    }, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
