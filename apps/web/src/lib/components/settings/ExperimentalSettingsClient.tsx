"use client";

import { useQuery, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@eva/backend";
import { Spinner, Switch } from "@eva/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { catchMutationError } from "@/lib/utils/mutationToast";

type ExperimentalFlagKey = FunctionArgs<
  typeof api.auth.setExperimentalFlag
>["key"];

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
        <ListEnter index={0} fast staggerMax={8}>
          <SettingsToggleRow
            title="Disable page animations"
            description="Skip page and list enters, chart draws, and panel motion. Hover marquees, loading UI, the composer beam, and the sessions sidebar working indicator stay on."
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
        </ListEnter>
        <ListEnter index={1} fast staggerMax={8}>
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
        </ListEnter>
        <ListEnter index={2} fast staggerMax={8}>
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
        </ListEnter>
        <ListEnter index={3} fast staggerMax={8}>
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
        </ListEnter>
        <ListEnter index={4} fast staggerMax={8}>
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
        </ListEnter>
        <ListEnter index={5} fast staggerMax={8}>
          <SettingsToggleRow
            title="Composer predictions"
            description="Suggest your next message when Eva finishes a turn. Press Tab to put it in the composer. It never sends on its own."
            action={
              <Switch
                checked={flags.composerPredictions}
                onCheckedChange={(checked) =>
                  toggle("composerPredictions", checked)
                }
                aria-label="Composer predictions"
              />
            }
          />
        </ListEnter>
        <ListEnter index={6} fast staggerMax={8}>
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
        </ListEnter>
        <ListEnter index={7} fast staggerMax={8}>
          <SettingsToggleRow
            title="Notification bell"
            description="Ring a bell when a new notification arrives. Sounds different from the reply chime, and only plays on this machine."
            action={
              <Switch
                checked={flags.notificationBell}
                onCheckedChange={(checked) =>
                  toggle("notificationBell", checked)
                }
                aria-label="Notification bell"
              />
            }
          />
        </ListEnter>
        <ListEnter index={8} fast staggerMax={8}>
          <SettingsToggleRow
            title="View Vercel Deployment"
            description="Show the Vercel deployment status in quick task properties, and the View Preview item in the More menu."
            action={
              <Switch
                checked={flags.viewVercelDeployment === true}
                onCheckedChange={(checked) =>
                  toggle("viewVercelDeployment", checked)
                }
                aria-label="View Vercel Deployment"
              />
            }
          />
        </ListEnter>
        <ListEnter index={9} fast staggerMax={8}>
          <SettingsToggleRow
            title="Disable auto-archive"
            description="Keep sessions you create open when every pull request they hold is merged or closed. You can still archive them yourself."
            action={
              <Switch
                checked={flags.disableAutoArchive}
                onCheckedChange={(checked) =>
                  toggle("disableAutoArchive", checked)
                }
                aria-label="Disable auto-archive"
              />
            }
          />
        </ListEnter>
        <ListEnter index={10} fast staggerMax={8}>
          <SettingsToggleRow
            title="Ask teammates"
            description="Let the agent route design and product questions to teammates through Manager Ave. Also shows your work profile and the waiting-on-teammates banner above the composer."
            action={
              <Switch
                checked={flags.askTeammates}
                onCheckedChange={(checked) => toggle("askTeammates", checked)}
                aria-label="Ask teammates"
              />
            }
          />
        </ListEnter>
        <ListEnter index={11} fast staggerMax={8}>
          <SettingsToggleRow
            title="Open pull requests on GitHub"
            description="Open a pull request on GitHub in a new tab when you click it in the Reviews sidebar, instead of the review view in Eva. Cmd or Ctrl-click still opens it in Eva."
            action={
              <Switch
                checked={flags.openPrsOnGithub}
                onCheckedChange={(checked) =>
                  toggle("openPrsOnGithub", checked)
                }
                aria-label="Open pull requests on GitHub"
              />
            }
          />
        </ListEnter>
        <ListEnter index={12} fast staggerMax={8}>
          <SettingsToggleRow
            title="Claude-style activity steps"
            description="Keep a reply's activity steps open in chat after the agent finishes, instead of folding them under Worked for. Text the agent writes between tool runs shows in order, between the steps (new turns only)."
            action={
              <Switch
                checked={flags.claudeStyleActivity}
                onCheckedChange={(checked) =>
                  toggle("claudeStyleActivity", checked)
                }
                aria-label="Claude-style activity steps"
              />
            }
          />
        </ListEnter>
        <ListEnter index={13} fast staggerMax={8}>
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
        </ListEnter>
      </SettingsSection>
    </SettingsPage>
  );
}
