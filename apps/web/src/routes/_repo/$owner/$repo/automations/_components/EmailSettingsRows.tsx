import type { Doc } from "@eva/backend";
import { Switch, SettingsToggleRow } from "@vvedantb/ui";

/**
 * The email toggles shared by custom and system automation settings. Review
 * is on unless `emailAutoSend` is set, so a run's email waits as a draft.
 */
export function EmailSettingsRows({
  automation,
  commit,
}: {
  automation: Doc<"automations">;
  commit: (fields: { sendEmail?: boolean; emailAutoSend?: boolean }) => void;
}) {
  return (
    <>
      <SettingsToggleRow
        title="Send email"
        description="Email this automation's run summary to all users when a run succeeds."
        action={
          <Switch
            checked={automation.sendEmail === true}
            onCheckedChange={(next) => commit({ sendEmail: next })}
            aria-label="Send email"
          />
        }
      />
      {automation.sendEmail === true ? (
        <SettingsToggleRow
          title="Review before sending"
          description="Keep each email as a draft on its run until you edit and send it."
          action={
            <Switch
              checked={automation.emailAutoSend !== true}
              onCheckedChange={(next) => commit({ emailAutoSend: !next })}
              aria-label="Review before sending"
            />
          }
        />
      ) : null}
    </>
  );
}
