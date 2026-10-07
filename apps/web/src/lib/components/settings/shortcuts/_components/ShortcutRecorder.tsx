"use client";

import { useState } from "react";
import { Button, cn } from "@eva/ui";
import { useHotkeyRecorder, type Hotkey } from "@tanstack/react-hotkeys";
import { Kbd } from "@/lib/components/ui/Kbd";
import { slotDigitOf, type ShortcutDef } from "@/lib/hotkeys/registry";

const SLOT_HINT = "That combo needs to end in a digit from 1 to 9.";

/**
 * The record button for one shortcut row. Click it, press the combo, done —
 * Escape cancels and Backspace clears back to the default, both handled by the
 * library's recorder.
 *
 * The button also cancels, because Escape and Backspace do not exist on a phone:
 * tapping it used to arm recording with no way out and no way to record, so the
 * row was a dead end on touch. Rebinding a shortcut still needs a keyboard —
 * that is inherent — but entering the state is now reversible for everyone.
 */
export function ShortcutRecorder({
  def,
  binding,
  onRecord,
}: {
  def: ShortcutDef;
  /** The combo in force right now, shown while not recording. */
  binding: Hotkey;
  /** `null` means "clear the override and go back to the default". */
  onRecord: (hotkey: Hotkey | null) => void;
}) {
  const [rejected, setRejected] = useState<string | null>(null);

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      // Slotted shortcuts drive a run of numbered bindings, so the recorded
      // key has to be the digit the other slots are derived from.
      if (def.slots !== undefined && slotDigitOf(hotkey) === null) {
        setRejected(SLOT_HINT);
        return;
      }
      setRejected(null);
      onRecord(hotkey);
    },
    onCancel: () => setRejected(null),
    onClear: () => {
      setRejected(null);
      onRecord(null);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setRejected(null);
          if (recorder.isRecording) {
            recorder.cancelRecording();
            return;
          }
          recorder.startRecording();
        }}
        aria-label={
          recorder.isRecording
            ? `Stop changing the shortcut for ${def.name}`
            : `Change the shortcut for ${def.name}`
        }
        className={cn(
          "min-w-28 justify-center font-mono",
          recorder.isRecording && "border-primary text-primary",
        )}
      >
        {recorder.isRecording ? (
          "Press keys…"
        ) : (
          <Kbd hotkey={binding} className="border-0 bg-transparent p-0 text-current" />
        )}
      </Button>
      {recorder.isRecording ? (
        <p className="text-2xs text-muted-foreground">
          Esc or tap cancels · Backspace resets
        </p>
      ) : null}
      {rejected ? <p className="text-2xs text-warning">{rejected}</p> : null}
    </div>
  );
}
