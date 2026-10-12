"use client";

import { cn } from "@eva/ui";
import { formatForDisplay, type Hotkey } from "@tanstack/react-hotkeys";
import { useShortcutBinding } from "@/lib/hotkeys/useShortcut";
import {
  deriveSlotHotkey,
  shortcutDef,
  type ShortcutId,
} from "@/lib/hotkeys/registry";

const KBD_CLASS =
  "rounded bg-muted px-1 py-0.5 font-mono text-3xs text-muted-foreground";

/**
 * One key cap. Renders the platform's own notation — `⌘⇧B` on macOS,
 * `Ctrl+Shift+B` elsewhere — so hints match what the user actually presses.
 */
export function Kbd({
  hotkey,
  className,
}: {
  hotkey: Hotkey;
  className?: string;
}) {
  return (
    <kbd className={cn(KBD_CLASS, className)}>{formatForDisplay(hotkey)}</kbd>
  );
}

/**
 * A key cap for a registered shortcut, following the user's own binding. Use
 * this for every inline hint so nothing can drift out of sync with the
 * registration the way the rail's hardcoded `⌘1…⌘9` badges once did.
 *
 * `slot` picks one entry out of a slotted shortcut (the rail's jump-to-app
 * range); it is ignored by every other id.
 */
export function ShortcutKbd({
  id,
  slot,
  className,
}: {
  id: ShortcutId;
  slot?: number;
  className?: string;
}) {
  const binding = useShortcutBinding(id);
  const resolved =
    slot === undefined || shortcutDef(id).slots === undefined
      ? binding
      : deriveSlotHotkey(binding, slot);

  if (resolved === null) return null;
  return <Kbd hotkey={resolved} className={className} />;
}
