"use client";

import { Kbd, ShortcutKbd } from "@/lib/components/ui/Kbd";
import { shortcutDef, type ShortcutId } from "@/lib/hotkeys/registry";
import type { Hotkey } from "@tanstack/react-hotkeys";

/**
 * One cheatsheet line: what the shortcut is called, what it does, and the combo
 * actually in force — read through `ShortcutKbd`, so a rebound key shows the
 * user's own combo rather than the default it replaced.
 *
 * A slotted shortcut (the rail's jump-to-app range) is shown as its first and
 * last slot with an ellipsis between, because nine rows of `Alt+N` would bury
 * everything else.
 */
export function ShortcutCheatsheetRow({ id }: { id: ShortcutId }) {
  const def = shortcutDef(id);
  const slots = def.slots;

  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{def.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {def.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {slots === undefined ? (
          <ShortcutKbd id={id} />
        ) : (
          <>
            <ShortcutKbd id={id} slot={1} />
            <span className="text-xs text-muted-foreground">…</span>
            <ShortcutKbd id={id} slot={slots} />
          </>
        )}
      </div>
    </div>
  );
}

/** A fixed editing key: no binding to resolve, so the caps are rendered raw. */
export function EditingKeyRow({
  keys,
  description,
}: {
  keys: ReadonlyArray<Hotkey>;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <p className="min-w-0 text-sm text-foreground">{description}</p>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {keys.map((key) => (
          <Kbd key={key} hotkey={key} />
        ))}
      </div>
    </div>
  );
}
