import { useState } from "react";
import { CronScheduleCard } from "@/lib/components/CronScheduleCard";

/**
 * Cron field for a saved automation. The server value is the owner; `draft`
 * exists only while the user types (the field converts local↔UTC with a live
 * preview, so it saves on blur, not per keystroke). Blur without typing saves
 * nothing, so a remote schedule change is never overwritten by a stale copy.
 */
export function AutomationCronField({
  cronSchedule,
  onSave,
}: {
  cronSchedule: string;
  /** Resolves once the save settles (success or handled failure). */
  onSave: (cronSchedule: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <CronScheduleCard
      value={draft ?? cronSchedule}
      onChange={setDraft}
      onBlurCommit={(value) => {
        if (draft === null || value === cronSchedule) {
          setDraft(null);
          return;
        }
        // Keep the draft until the save lands so the field does not flash
        // the old value; drop it only if the user has not typed since.
        void onSave(value).then(() =>
          setDraft((current) => (current === value ? null : current)),
        );
      }}
    />
  );
}
