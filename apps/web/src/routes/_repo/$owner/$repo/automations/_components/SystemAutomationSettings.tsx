import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api, normalizeAIModel } from "@eva/backend";
import type { Doc } from "@eva/backend";
import { Button, ModelSelect, Switch, toast } from "@eva/ui";
import { CronScheduleCard } from "@/lib/components/CronScheduleCard";
import { SettingsStack } from "@/lib/components/settings/SettingsStack";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import {
  IssueLabelField,
  automationTriggerOf,
  describeTrigger,
} from "./TriggerSection";

/**
 * Settings tab for an installed system automation. eva owns the title, prompt
 * and mode; the schedule, model and the install-level toggles belong to the
 * user, as does uninstalling it from this app.
 */
export function SystemAutomationSettings({
  automation,
  systemKey,
  repoOwner,
  repoName,
}: {
  automation: Doc<"automations">;
  systemKey: string;
  repoOwner: string;
  repoName: string;
}) {
  const { repo, repoId } = useRepo();
  const navigate = useNavigate();
  const updateAutomation = useMutation(api.automations.update);
  const uninstall = useMutation(api.automations.uninstallSystemAutomation);
  // Mirrors SettingsForm: the cron field is controlled with a live local-time
  // preview, so it needs an editing buffer and saves on blur.
  const [cronDraft, setCronDraft] = useState(automation.cronSchedule);
  const trigger = automationTriggerOf(automation);
  const model = normalizeAIModel(automation.model ?? repo.defaultModel);
  const { options: modelOptions } = useAvailableAiModels(repoId, model);

  const commit = (
    fields: Omit<Parameters<typeof updateAutomation>[0], "id">,
  ) => {
    void updateAutomation({ id: automation._id, ...fields })
      .then(() => toast.success("Saved", { id: "automation-saved" }))
      .catch(() =>
        toast.error("Couldn't save changes", { id: "automation-saved" }),
      );
  };

  return (
    <SettingsStack>
      {trigger.kind === "cron" ? (
        <CronScheduleCard
          value={cronDraft}
          onChange={setCronDraft}
          onBlurCommit={(v) => {
            if (v !== automation.cronSchedule) commit({ cronSchedule: v });
          }}
        />
      ) : (
        <SettingsSection
          title="Trigger"
          description={describeTrigger(trigger)}
          bodyVariant={trigger.event === "issue_labeled" ? "form" : "compact"}
        >
          {trigger.event === "issue_labeled" ? (
            <IssueLabelField
              trigger={trigger}
              onChange={(next) => commit({ trigger: next })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Runs automatically; there is no schedule to set.
            </p>
          )}
        </SettingsSection>
      )}

      <SettingsSection title="Prompt">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {automation.description}
        </p>
      </SettingsSection>

      <SettingsSection title="Behaviour" bodyVariant="list">
        <SettingsToggleRow
          title="Enabled"
          description={
            trigger.kind === "cron"
              ? "Run this automation on its schedule for this app."
              : "Run this automation whenever its event happens in this app."
          }
          action={
            <Switch
              checked={automation.enabled}
              onCheckedChange={(next) => commit({ enabled: next })}
              aria-label="Enabled"
            />
          }
        />
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
      </SettingsSection>

      <SettingsSection title="Model">
        <SettingsField label="Provider and model">
          <ModelSelect
            value={model}
            options={modelOptions}
            onValueChange={(m) => commit({ model: m })}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Uninstall"
        description="Remove this automation from the app. Reinstalling it from the Automations Hub brings its run history back."
        bodyVariant="compact"
        bodyClassName="flex justify-end"
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            void uninstall({ repoId, key: systemKey })
              .then(() =>
                navigate({
                  to: "/$owner/$repo/automations",
                  params: { owner: repoOwner, repo: repoName },
                }),
              )
              .catch(() =>
                toast.error("Couldn't uninstall automation", {
                  id: "automation-saved",
                }),
              );
          }}
        >
          Uninstall
        </Button>
      </SettingsSection>

      <p className="px-4 text-xs leading-relaxed text-muted-foreground">
        This automation is built into eva. Its title, prompt, trigger and
        report-only mode are managed by eva;{" "}
        {trigger.kind === "cron"
          ? "the schedule and model are yours to change."
          : "the model is yours to change."}
      </p>
    </SettingsStack>
  );
}
