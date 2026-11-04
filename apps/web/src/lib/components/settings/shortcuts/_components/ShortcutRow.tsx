"use client";

import { Button, SettingsToggleRow } from "@vvedantb/ui";
import { type Hotkey } from "@tanstack/react-hotkeys";
import { ShortcutRecorder } from "@/lib/components/settings/shortcuts/_components/ShortcutRecorder";
import { shortcutDef, type ShortcutId } from "@/lib/hotkeys/registry";

/** One rebindable shortcut: what it does, its current combo, and how to change it. */
export function ShortcutRow({
  id,
  binding,
  isOverridden,
  conflictsWith,
  onRecord,
}: {
  id: ShortcutId;
  binding: Hotkey;
  isOverridden: boolean;
  /** Names of other shortcuts sharing this combo, if any. */
  conflictsWith: ReadonlyArray<string>;
  onRecord: (hotkey: Hotkey | null) => void;
}) {
  const def = shortcutDef(id);

  return (
    <SettingsToggleRow
      // The recorder plus Reset is ~185px, which leaves the description one
      // word wide on a phone — wrap the action under the label instead.
      className="max-sm:flex-wrap"
      title={def.name}
      description={
        <>
          {def.description}
          {conflictsWith.length > 0 ? (
            <span className="mt-1 block text-warning">
              Same combo as {conflictsWith.join(", ")}. Whichever is on screen
              wins.
            </span>
          ) : null}
        </>
      }
      action={
        <div className="flex items-start gap-2">
          <ShortcutRecorder def={def} binding={binding} onRecord={onRecord} />
          {isOverridden ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRecord(null)}
              aria-label={`Reset ${def.name} to its default`}
            >
              Reset
            </Button>
          ) : null}
        </div>
      }
    />
  );
}
