"use client";

import { CircleSpinner } from "@eva/ui";
import { SonnerToaster } from "@vvedantb/ui/sonner";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * Eva-only layout on top of the package defaults. Package classes come first
 * and these follow. `!` stays only where a package utility sets the same
 * property and merge order cannot decide (padding, description size, radius,
 * button fills). Title leading and stacked-content hiding are package props.
 */
const EVA_TOAST_CLASS_NAMES = {
  toast: "cursor-pointer gap-x-4 px-3! font-sans",
  icon: "relative flex h-6 w-6 shrink-0 items-center justify-center",
  content: "flex min-w-0 grow flex-col",
  title: "me-4 wrap-break-word",
  description: "me-4 wrap-break-word text-sm! leading-5!",
  actionButton:
    "h-7 shrink-0 rounded-control! hover:bg-primary/90! hover:opacity-100! motion-press active:scale-[0.96]",
  cancelButton:
    "h-7 shrink-0 rounded-control! bg-muted! hover:bg-muted/80! motion-press active:scale-[0.96]",
  closeButton: "duration-[var(--motion-base)]",
};

/**
 * Global toast host. Reads the resolved app theme so sonner matches
 * light/dark, and pins toasts to the top-right corner. The look comes from the
 * shared `@vvedantb/ui` toaster; Eva adds its layout through `classNames`.
 */
export function AppToaster() {
  const { resolvedTheme } = useThemeMode();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="top-right"
      gap={8}
      toastRadius="surface"
      toastIcons="filled24"
      closeButtonStyle="hoverChip"
      sonnerVars
      descriptionMuted
      titleLeading="5"
      hideStackedContent
      loadingIcon={<CircleSpinner size="md" aria-hidden="true" />}
      toastOptions={{ classNames: EVA_TOAST_CLASS_NAMES }}
    />
  );
}
