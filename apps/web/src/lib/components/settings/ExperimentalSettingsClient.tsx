"use client";

import { useQuery, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@eva/backend";
import { Spinner, Switch } from "@vvedantb/ui";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { catchMutationError } from "@/lib/utils/mutationToast";

type ExperimentalFlagKey = FunctionArgs<
  typeof api.auth.setExperimentalFlag
>["key"];

interface FlagRow {
  key: ExperimentalFlagKey;
  title: string;
  description: string;
}

interface FlagGroup {
  title: string;
  flags: FlagRow[];
}

/** Every flag, once, in the section it shows under. */
const FLAG_GROUPS: FlagGroup[] = [
  {
    title: "Appearance",
    flags: [
      {
        key: "disablePageMotion",
        title: "Disable page animations",
        description:
          "Skip page and list enters, chart draws, and panel motion. Hover marquees, loading UI, the composer beam, and the sessions sidebar working indicator stay on.",
      },
      {
        key: "sessionTabs",
        title: "Chrome-style session tabs",
        description:
          "Use horizontal tabs grouped by app. Archived and merged PRs move into an Archived menu.",
      },
      {
        key: "blurPid",
        title: "Blur personal info",
        description:
          "Blur names and emails when screen recording. Avatars stay visible.",
      },
      {
        key: "claudeStyleActivity",
        title: "Claude-style activity steps",
        description:
          "Keep a reply's activity steps open in chat after the agent finishes, instead of folding them under Worked for. Text the agent writes between tool runs shows in order, between the steps (new turns only).",
      },
      {
        key: "simpleView",
        title: "Simple view",
        description:
          "Hide reviews, diffs, tool activity steps, message footers, sandbox system messages, context usage, automations, model traits and older models, sandbox Files / Console / Editor / Computer / New Preview, repo settings entirely, global Sandboxes / Sync, and team Codebases / Env Variables. Chat plus Preview, Browser, Plan, and Designs. The model picker becomes a five-step slider; Advanced restores the list.",
      },
    ],
  },
  {
    title: "Composer",
    flags: [
      {
        key: "voiceDictation",
        title: "Voice dictation",
        description:
          "Use speech-to-text in chat and quick tasks. Requires microphone permission.",
      },
      {
        key: "composerAutocomplete",
        title: "Composer autocomplete",
        description:
          "Suggest inline completions while typing in chat and task composers. Press Tab to accept.",
      },
      {
        key: "composerPredictions",
        title: "Composer predictions",
        description:
          "Suggest your next message when Eva finishes a turn. Press Tab to put it in the composer. It never sends on its own.",
      },
    ],
  },
  {
    title: "Notifications",
    flags: [
      {
        key: "replyChime",
        title: "Reply chime",
        description:
          "Play the notification sound when the agent finishes replying to you. Only your turns chime, and only on this machine.",
      },
      {
        key: "notificationBell",
        title: "Notification bell",
        description:
          "Ring a bell when a new notification arrives. Sounds different from the reply chime, and only plays on this machine.",
      },
    ],
  },
  {
    title: "Agent",
    flags: [
      {
        key: "askTeammates",
        title: "Ask teammates",
        description:
          "Let the agent route design and product questions to teammates through Manager Ave. Also shows your work profile and the waiting-on-teammates banner above the composer.",
      },
      {
        key: "scopeCheck",
        title: "Scope check",
        description:
          "After a reply that changes code, check each change against your request. A chip under the reply flags changes you did not ask for or were not told about (new turns only).",
      },
    ],
  },
  {
    title: "Git and pull requests",
    flags: [
      {
        key: "manualSideBranchPublish",
        title: "Manual side branch pushes",
        description:
          "Eva auto-commits and auto-pushes only the chat's own branch at the end of your turns. Side branches the agent creates are left to the agent, or to Commit & push on the branch chip.",
      },
      {
        key: "disableAutoArchive",
        title: "Disable auto-archive",
        description:
          "Keep sessions you create open when every pull request they hold is merged or closed. You can still archive them yourself.",
      },
      {
        key: "openPrsOnGithub",
        title: "Open pull requests on GitHub",
        description:
          "Open a pull request on GitHub in a new tab when you click it in the Reviews sidebar, instead of the review view in Eva. Cmd or Ctrl-click still opens it in Eva.",
      },
      {
        key: "prWatch",
        title: "Pull request watch",
        description:
          "Let the agent watch its pull requests. Eva wakes the chat when checks fail or pass, a reviewer comments, or the branch conflicts.",
      },
      {
        key: "viewVercelDeployment",
        title: "View Vercel Deployment",
        description:
          "Show the Vercel deployment status in quick task properties, and the View Preview item in the More menu.",
      },
    ],
  },
];

/** Each group's first row index, so the enter stagger flows down the page. */
const GROUP_START_INDEX = FLAG_GROUPS.map((_, groupIndex) =>
  FLAG_GROUPS.slice(0, groupIndex).reduce(
    (count, group) => count + group.flags.length,
    0,
  ),
);

const pageDescription = (
  <p className="px-4 text-pretty text-sm text-muted-foreground">
    Optional features. Off by default until you turn them on.
  </p>
);

export function ExperimentalSettingsClient() {
  const flags = useQuery(api.auth.getExperimentalFlags);
  const setFlag = useMutation(
    api.auth.setExperimentalFlag,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.auth.getExperimentalFlags, {});
    if (current === undefined) return;
    localStore.setQuery(
      api.auth.getExperimentalFlags,
      {},
      { ...current, [args.key]: args.enabled },
    );
  });

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
        {pageDescription}
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Experimental">
      {pageDescription}
      {FLAG_GROUPS.map((group, groupIndex) => (
        <SettingsSection
          key={group.title}
          title={group.title}
          bodyVariant="list"
        >
          {group.flags.map((flag, flagIndex) => (
            <ListEnter
              key={flag.key}
              index={GROUP_START_INDEX[groupIndex] + flagIndex}
              fast
              staggerMax={8}
            >
              <SettingsToggleRow
                title={flag.title}
                description={flag.description}
                action={
                  <Switch
                    checked={flags[flag.key]}
                    onCheckedChange={(checked) => toggle(flag.key, checked)}
                    aria-label={flag.title}
                  />
                }
              />
            </ListEnter>
          ))}
        </SettingsSection>
      ))}
    </SettingsPage>
  );
}
