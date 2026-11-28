"use client";

import { SonnerToaster } from "@vvedantb/ui";
import { useEffect } from "react";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { undoLatestToast } from "@/lib/utils/undoToast";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}

/**
 * Global toast host. Reads the resolved app theme so sonner matches
 * light/dark, and pins toasts to the top-right corner. Ctrl/Cmd+Z runs the
 * newest toast Undo.
 */
export function AppToaster() {
  const { resolvedTheme } = useThemeMode();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.shiftKey || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      if (undoLatestToast(isEditableTarget(event.target))) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <SonnerToaster theme={resolvedTheme} position="top-right" />;
}
