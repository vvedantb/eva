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
        void onSave(value).then(() =>
          setDraft((current) => (current === value ? null : current)),
        );
      }}
    />
  );
}
