import { useId } from "react";
import {
  DEFAULT_ISSUE_LABEL,
  REPO_EVENT_LABELS,
  USER_REPO_EVENTS,
  type AutomationTrigger,
  type RepoEventKind,
} from "@eva/backend";
import { CRON_TRIGGER, capitalise } from "./trigger";
import {
  Input,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  SettingsField,
  SettingsSection,
  SettingsToggleRow,
} from "@vvedantb/ui";

/**
 * Trigger picker for a user automation: its cron schedule (rendered by the
 * caller as `schedule`) or repo events, one switch each. Any switched-on event
 * starts a run. Saves on change, like the other switches.
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
  return (
    <>
      <SettingsSection
        title="Trigger"
        description={
          trigger.kind === "cron"
            ? "Runs on a schedule."
            : "Runs each time one of these events happens in this repo."
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
                ? { kind: "event", events: ["pr_merged"] }
                : CRON_TRIGGER,
            );
          }}
        >
          <TabsList>
            <TabsTrigger value="cron">Schedule</TabsTrigger>
            <TabsTrigger value="event">Event</TabsTrigger>
          </TabsList>
        </Tabs>
        {trigger.kind === "event" &&
        trigger.events.includes("issue_labeled") ? (
          <IssueLabelField trigger={trigger} onChange={onChange} />
        ) : null}
      </SettingsSection>
      {trigger.kind === "event" ? (
        <EventSwitches trigger={trigger} onChange={onChange} />
      ) : null}
      {trigger.kind === "cron" ? schedule : null}
    </>
  );
}

/** One switch per event. The last one on stays on: an event trigger needs one. */
function EventSwitches({
  trigger,
  onChange,
}: {
  trigger: Extract<AutomationTrigger, { kind: "event" }>;
  onChange: (next: AutomationTrigger) => void;
}) {
  const toggle = (event: RepoEventKind, on: boolean) =>
    onChange({
      ...trigger,
      events: on
        ? USER_REPO_EVENTS.filter(
            (e) => e === event || trigger.events.includes(e),
          )
        : trigger.events.filter((e) => e !== event),
    });
  return (
    <SettingsSection title="Runs when" bodyVariant="list">
      {USER_REPO_EVENTS.map((event) => {
        const on = trigger.events.includes(event);
        const title = capitalise(REPO_EVENT_LABELS[event]);
        return (
          <SettingsToggleRow
            key={event}
            title={title}
            action={
              <Switch
                checked={on}
                disabled={on && trigger.events.length === 1}
                onCheckedChange={(next) => toggle(event, next)}
                aria-label={title}
              />
            }
          />
        );
      })}
    </SettingsSection>
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
