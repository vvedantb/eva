import { Button } from "@vvedantb/native-ui/primitives";
import { DateTimeField } from "@vvedantb/native-ui/date-time";
import { useState } from "react";
import { View } from "react-native";
import { FooterSheet } from "@/chat/ComposerFooter";
import { useNow } from "@/ui/clock";

/** The next full hour after `now`: a time that can be scheduled as it opens. */
function nextFullHour(now: number): number {
  const at = new Date(now);
  at.setMinutes(0, 0, 0);
  at.setHours(at.getHours() + 1);
  return at.getTime();
}

/**
 * The web `SchedulePopover` / `ScheduleDateTimePicker` as a bottom sheet: the
 * date and time (the next full hour, or the current schedule, when it opens;
 * the web opens on now, which a phone picker would leave unschedulable until
 * changed), then Schedule,
 * or Remove and Update once scheduled, as the web's buttons. A time that has
 * passed cannot be scheduled. The caller runs the writes and closes the sheet.
 */
export function ScheduleSheet({
  open,
  onOpenChange,
  title,
  scheduledAt,
  onSchedule,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The current schedule: the sheet edits it, with Remove. */
  scheduledAt: number | undefined;
  /** Called with the picked time (a new schedule or an update). */
  onSchedule: (timestamp: number) => void;
  onRemove?: () => void;
}) {
  // The picked time, seeded each time the sheet opens (the web `reset` on open).
  const [picked, setPicked] = useState<{ for: number | undefined; at: Date } | null>(null);
  // The minute clock, so "has it passed" stays true to the time while the sheet is open.
  const now = useNow(60_000);
  const seed = picked && picked.for === scheduledAt ? picked.at : new Date(scheduledAt ?? nextFullHour(now));
  const isScheduled = scheduledAt !== undefined;
  const future = seed.getTime() > now;
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setPicked(null);
  };
  return (
    <FooterSheet open={open} onOpenChange={close} title={title}>
      <View className="gap-4 px-2 pb-4">
        <DateTimeField value={seed} onChange={(at) => setPicked({ for: scheduledAt, at })} />
        <View className="flex-row gap-2">
          {isScheduled && onRemove ? (
            <View className="flex-1">
              <Button variant="destructive" onPress={onRemove}>
                Remove
              </Button>
            </View>
          ) : null}
          <View className="flex-1">
            <Button disabled={!future} onPress={() => onSchedule(seed.getTime())}>
              {isScheduled ? "Update" : "Schedule"}
            </Button>
          </View>
        </View>
      </View>
    </FooterSheet>
  );
}
