"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { Input, Textarea } from "@eva/ui";
import { parseCommandLines } from "./_utils";
import { LogoSettingsSection } from "./_components/LogoSettingsSection";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { SetUpWithEvaButton } from "@/lib/components/evaConfig/SetUpWithEvaButton";
import { AppCommandsReadOnly } from "./_components/AppCommandsReadOnly";

const COMMAND_TEXTAREA_CLASS = "resize-y bg-background font-mono text-xs";

export function AppClient() {
  const { repo, repoId, owner, name } = useRepo();
  const appName = repo.rootDirectory?.split("/").pop();
  const updateConfig = useMutation(
    api.githubRepos.updateConfig,
  ).withOptimisticUpdate((localStore, args) => {
    const queryArgs = { owner, name, appName };
    const current = localStore.getQuery(
      api.githubRepos.getByOwnerAndName,
      queryArgs,
    );
    if (current !== undefined && current !== null) {
      const { repoId: _id, devPort, ...safeFields } = args;
      localStore.setQuery(api.githubRepos.getByOwnerAndName, queryArgs, {
        ...current,
        ...safeFields,
        ...(devPort !== undefined ? { devPort: devPort ?? undefined } : {}),
      });
    }
  });

  const startupCommands = repo.startupCommands?.join("\n") ?? "";
  const backgroundCommands = repo.backgroundCommands?.join("\n") ?? "";
  const stopCommands = repo.stopCommands?.join("\n") ?? "";

  const saveConfig = (args: Parameters<typeof updateConfig>[0]) => {
    // A repo with `.eva/config.json` owns its commands; the backend rejects
    // command edits, so a late blur after the file synced is dropped here.
    const sendsCommands =
      args.devPort !== undefined ||
      args.devCommand !== undefined ||
      args.startupCommands !== undefined ||
      args.backgroundCommands !== undefined ||
      args.stopCommands !== undefined;
    if (repo.evaConfig !== undefined && sendsCommands) return;
    void catchMutationError(
      updateConfig(args),
      "Couldn't save app settings",
      "app-config-save",
    );
  };

  const handleDevPortBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === "") {
      if (repo.devPort !== undefined) {
        saveConfig({ repoId, devPort: null });
      }
      return;
    }
    const port = parseInt(raw, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) return;
    if (port === repo.devPort) return;
    saveConfig({ repoId, devPort: port });
  };

  const handleDevCommandBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (next === (repo.devCommand ?? "")) return;
    saveConfig({ repoId, devCommand: next });
  };

  const handleStartupCommandsBlur = (
    e: React.FocusEvent<HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (next === startupCommands) return;
    saveConfig({ repoId, startupCommands: parseCommandLines(next) });
  };

  const handleBackgroundCommandsBlur = (
    e: React.FocusEvent<HTMLTextAreaElement>,
  ) => {
    const next = e.target.value;
    if (next === backgroundCommands) return;
    saveConfig({ repoId, backgroundCommands: parseCommandLines(next) });
  };

  const handleStopCommandsBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next === stopCommands) return;
    saveConfig({ repoId, stopCommands: parseCommandLines(next) });
  };

  const handleSystemPromptBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (next === (repo.systemPrompt ?? "")) return;
    saveConfig({ repoId, systemPrompt: next });
  };

  return (
    <SettingsPage title="App">
      <LogoSettingsSection repoId={repoId} />

      <SettingsSection
        title="Instructions"
        description="Added to every quick task and session for this app."
      >
        <Textarea
          key={`system-prompt-${repoId}`}
          defaultValue={repo.systemPrompt ?? ""}
          onBlur={handleSystemPromptBlur}
          className={`h-28 ${COMMAND_TEXTAREA_CLASS}`}
          placeholder="e.g. run pnpm migrate after backend changes"
        />
      </SettingsSection>

      {repo.evaConfig !== undefined ? (
        <AppCommandsReadOnly
          evaConfig={repo.evaConfig}
          devPort={repo.devPort}
          devCommand={repo.devCommand}
          startupCommands={repo.startupCommands}
          backgroundCommands={repo.backgroundCommands}
          stopCommands={repo.stopCommands}
        />
      ) : (
        <>
          <SettingsSection
            title="Dev server"
            action={<SetUpWithEvaButton />}
            description={
              <>
                Overrides auto-detection from <code>package.json</code>. Leave
                empty to detect.
              </>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField label="Port" description="Empty = auto-detect.">
                <Input
                  key={`port-${repoId}`}
                  type="number"
                  className="h-9"
                  placeholder="5173 or 3000"
                  defaultValue={repo.devPort ?? ""}
                  onBlur={handleDevPortBlur}
                />
              </SettingsField>

              <SettingsField
                label="Command"
                description={
                  <>
                    Runs as written. Include your own <code>cd</code> /{" "}
                    <code>PORT=</code> if needed.
                  </>
                }
              >
                <Input
                  key={`cmd-${repoId}`}
                  className="h-9 font-mono text-xs"
                  placeholder="pnpm run dev"
                  defaultValue={repo.devCommand ?? ""}
                  onBlur={handleDevCommandBlur}
                />
              </SettingsField>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Sandbox lifecycle"
            description="Commands for boot, daemons, and seeded snapshots. One per line."
          >
            <div className="grid gap-5">
              <SettingsField
                label="Startup"
                description="Runs on every sandbox boot. Keep these idempotent. One-time seeding belongs in Snapshots."
              >
                <Textarea
                  key={`startup-${repoId}`}
                  defaultValue={startupCommands}
                  onBlur={handleStartupCommandsBlur}
                  className={`h-36 ${COMMAND_TEXTAREA_CLASS}`}
                  placeholder="npx supabase start"
                />
              </SettingsField>

              <SettingsField
                label="Background"
                description={
                  <>
                    Long-running daemons (e.g. <code>npx convex dev</code>). Eva
                    detaches them for you — no <code>nohup</code> or{" "}
                    <code>&amp;</code> needed.
                  </>
                }
              >
                <Textarea
                  key={`background-${repoId}`}
                  defaultValue={backgroundCommands}
                  onBlur={handleBackgroundCommandsBlur}
                  className={`h-28 ${COMMAND_TEXTAREA_CLASS}`}
                  placeholder="npx convex dev"
                />
              </SettingsField>

              <SettingsField
                label="Stop"
                description="Run before a seeded snapshot so local DBs flush cleanly. Not used on normal boots."
              >
                <Textarea
                  key={`stop-${repoId}`}
                  defaultValue={stopCommands}
                  onBlur={handleStopCommandsBlur}
                  className={`h-28 ${COMMAND_TEXTAREA_CLASS}`}
                  placeholder="pkill -TERM -f 'convex dev'"
                />
              </SettingsField>
            </div>
          </SettingsSection>
        </>
      )}
    </SettingsPage>
  );
}
