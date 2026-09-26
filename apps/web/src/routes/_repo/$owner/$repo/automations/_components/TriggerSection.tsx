import { useId } from "react";
import {
  DEFAULT_ISSUE_LABEL,
  REPO_EVENT_LABELS,
  USER_REPO_EVENTS,
  type AutomationTrigger,
} from "@eva/backend";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@eva/ui";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";

const CRON_TRIGGER: AutomationTrigger = { kind: "cron" };

/** A row's trigger; rows from before event triggers run on their schedule. */
export function automationTriggerOf(automation: {
  trigger?: AutomationTrigger;
}): AutomationTrigger {
  return automation.trigger ?? CRON_TRIGGER;
}

/** "Runs when …" for an event trigger, or null for a schedule. */
export function describeTrigger(trigger: AutomationTrigger): string | null {
  if (trigger.kind === "cron") return null;
  const when = REPO_EVENT_LABELS[trigger.event];
  if (trigger.event !== "issue_labeled") return `Runs when ${when}`;
  return `Runs when an issue is labelled "${trigger.label ?? DEFAULT_ISSUE_LABEL}"`;
}

/**
 * Trigger picker for a user automation: its cron schedule (rendered by the
 * caller as `schedule`) or a repo event. Saves on change, like the switches.
 */
export function TriggerSection({
  trigger,
  onChange,
  schedule,
}: {
  trigger: AutomationTrigger;
  onChange: (next: AutomationTrigger) => void;
  schedule: React.ReactNode;
}) {
  const eventFieldId = useId();

  return (
    <>
      <SettingsSection
        title="Trigger"
        description={
          trigger.kind === "cron"
            ? "Runs on a schedule."
            : "Runs each time the event happens in this repo."
        }
        bodyVariant="compact"
        bodyClassName="grid gap-5"
      >
        <Tabs
          value={trigger.kind}
          onValueChange={(value) => {
            if (value === trigger.kind) return;
            onChange(
              value === "event"
                ? { kind: "event", event: "pr_merged" }
                : CRON_TRIGGER,
            );
          }}
        >
          <TabsList>
            <TabsTrigger value="cron">Schedule</TabsTrigger>
            <TabsTrigger value="event">Event</TabsTrigger>
          </TabsList>
        </Tabs>
        {trigger.kind === "event" ? (
          <>
            <SettingsField label="When" htmlFor={eventFieldId}>
              <Select
                value={trigger.event}
                onValueChange={(value) => {
                  const event = USER_REPO_EVENTS.find((e) => e === value);
                  if (event !== undefined) onChange({ kind: "event", event });
                }}
              >
                <SelectTrigger id={eventFieldId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_REPO_EVENTS.map((event) => (
                    <SelectItem key={event} value={event}>
                      {capitalise(REPO_EVENT_LABELS[event])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsField>
            {trigger.event === "issue_labeled" ? (
              <IssueLabelField trigger={trigger} onChange={onChange} />
            ) : null}
          </>
        ) : null}
      </SettingsSection>
      {trigger.kind === "cron" ? schedule : null}
    </>
  );
}

/** The label that fires an issue trigger. Saves on blur. */
export function IssueLabelField({
  trigger,
  onChange,
}: {
  trigger: Extract<AutomationTrigger, { kind: "event" }>;
  onChange: (next: AutomationTrigger) => void;
}) {
  const labelFieldId = useId();
  const current = trigger.label ?? DEFAULT_ISSUE_LABEL;
  return (
    <SettingsField
      label="Issue label"
      htmlFor={labelFieldId}
      description="Adding this label to a GitHub issue fires the automation."
    >
      <Input
        id={labelFieldId}
        placeholder={DEFAULT_ISSUE_LABEL}
        defaultValue={current}
        onBlur={(e) => {
          const next = e.target.value.trim() || DEFAULT_ISSUE_LABEL;
          if (next !== current) onChange({ ...trigger, label: next });
        }}
      />
    </SettingsField>
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
