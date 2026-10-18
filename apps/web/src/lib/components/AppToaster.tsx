"use client";

import { SonnerToaster } from "@vvedantb/ui";
import { useThemeMode } from "@/lib/hooks/useThemeMode";

/**
 * Eva-only layout on top of the package defaults. Package classes come first
 * and these follow, so `!` marks the ones that fight a package utility for the
 * same property (padding, gap, radius, hover fill).
 */
const EVA_TOAST_CLASS_NAMES = {
  toast: "cursor-pointer gap-x-4! px-3! py-3! font-sans [&[data-expanded=false][data-front=false]>*]:opacity-0",
  icon: "relative flex h-6 w-6 shrink-0 items-center justify-center",
  content: "flex min-w-0 grow flex-col",
  title: "me-4 wrap-break-word text-sm! leading-5!",
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
      toastOptions={{ classNames: EVA_TOAST_CLASS_NAMES }}
    />
  );
}
