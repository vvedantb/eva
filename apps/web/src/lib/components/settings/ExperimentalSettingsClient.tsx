"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Spinner, Switch } from "@eva/ui";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { catchMutationError } from "@/lib/utils/mutationToast";

type ExperimentalFlagKey =
  | "sessionTabs"
  | "blurPid"
  | "voiceDictation"
  | "composerAutocomplete"
  | "simpleView"
  | "replyChime"
  | "disablePageMotion";

export function ExperimentalSettingsClient() {
  const flags = useQuery(api.auth.getExperimentalFlags);
  const setFlag = useMutation(api.auth.setExperimentalFlag).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.auth.getExperimentalFlags, {});
      if (current === undefined) return;
      localStore.setQuery(
        api.auth.getExperimentalFlags,
        {},
        { ...current, [args.key]: args.enabled },
      );
    },
  );

  const toggle = (key: ExperimentalFlagKey, enabled: boolean) => {
    void catchMutationError(
      setFlag({ key, enabled }),
      "Couldn't update setting",
      `experimental-${key}`,
    );
  };

  if (flags === undefined) {
    return (
      <SettingsPage title="Experimental">
        <SettingsSection
          title="Flags"
          description="Optional features. Off by default until you turn them on."
          bodyVariant="list"
        />
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Experimental">
      <SettingsSection
        title="Flags"
        description="Optional features. Off by default until you turn them on."
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Disable page animations"
          description="Skip page and list enters, chart draws, and panel motion. Hover marquees, loading UI, the composer glow, and the sessions sidebar working indicator stay on."
          action={
            <Switch
              checked={flags.disablePageMotion === true}
              onCheckedChange={(checked) =>
                toggle("disablePageMotion", checked)
              }
              aria-label="Disable page animations"
            />
          }
        />
        <SettingsToggleRow
          title="Chrome-style session tabs"
          description="Use horizontal tabs grouped by app. Archived and merged PRs move into an Archived menu."
          action={
            <Switch
              checked={flags.sessionTabs}
              onCheckedChange={(checked) => toggle("sessionTabs", checked)}
              aria-label="Chrome-style session tabs"
            />
          }
        />
        <SettingsToggleRow
          title="Blur personal info"
          description="Blur names and emails when screen recording. Avatars stay visible."
          action={
            <Switch
              checked={flags.blurPid}
              onCheckedChange={(checked) => toggle("blurPid", checked)}
              aria-label="Blur personal info"
            />
          }
        />
        <SettingsToggleRow
          title="Voice dictation"
          description="Use speech-to-text in chat and quick tasks. Requires microphone permission."
          action={
            <Switch
              checked={flags.voiceDictation}
              onCheckedChange={(checked) => toggle("voiceDictation", checked)}
              aria-label="Voice dictation"
            />
          }
        />
        <SettingsToggleRow
          title="Composer autocomplete"
          description="Suggest inline completions while typing in chat and task composers. Press Tab to accept."
          action={
            <Switch
              checked={flags.composerAutocomplete}
              onCheckedChange={(checked) =>
                toggle("composerAutocomplete", checked)
              }
              aria-label="Composer autocomplete"
            />
          }
        />
        <SettingsToggleRow
          title="Reply chime"
          description="Play the notification sound when the agent finishes replying to you. Only your turns chime, and only on this machine."
          action={
            <Switch
              checked={flags.replyChime}
              onCheckedChange={(checked) => toggle("replyChime", checked)}
              aria-label="Reply chime"
            />
          }
        />
        <SettingsToggleRow
          title="Simple view"
          description="Hide reviews, diffs, tool activity steps, sandbox system messages, context usage, automations, model traits and older models, sandbox Files / Console / Editor / Computer / New Preview, repo settings entirely, global Sandboxes / Sync, and team Codebases / Env Variables. Chat plus Preview, Browser, Plan, and Designs. The model picker becomes a five-step slider; Advanced restores the list."
          action={
            <Switch
              checked={flags.simpleView === true}
              onCheckedChange={(checked) => toggle("simpleView", checked)}
              aria-label="Simple view"
            />
          }
        />
      </SettingsSection>
    </SettingsPage>
  );
}
