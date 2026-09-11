"use client";

import { formatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";
import { Kbd } from "@/lib/components/ui/Kbd";
import { cn } from "@eva/ui";
import { z } from "zod";
import { useAltHeld } from "./useAltHeld";

// `Hotkey` covers combinations, not a bare modifier, so the literal is parsed
// in rather than asserted. `formatForDisplay` renders it as ⌥ / Alt.
const ALT_HOTKEY = z.custom<Hotkey>().parse("Alt");

/** Platform-native "⌥-click skips confirmation" / "Alt-click skips confirmation". */
export function skipConfirmTitle(actionTitle?: string): string {
  const skip = `${formatForDisplay(ALT_HOTKEY)}-click skips confirmation`;
  return actionTitle ? `${actionTitle} · ${skip}` : skip;
}

/**
 * Visible only while Alt is held. Sits after the action label so every
 * confirmable control shows that this click will skip the dialog.
 */
export function ConfirmSkipHint({ className }: { className?: string }) {
  const altHeld = useAltHeld();
  if (!altHeld) return null;
  return <Kbd hotkey={ALT_HOTKEY} className={cn("ml-auto shrink-0", className)} />;
}
