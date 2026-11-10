"use client";

import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { Textarea, SettingsSection } from "@vvedantb/ui";
import { LogoSettingsSection } from "./_components/LogoSettingsSection";
import { catchMutationError } from "@/lib/utils/mutationToast";
import { EvaConfigSection } from "@/lib/components/evaConfig/EvaConfigSection";

const COMMAND_TEXTAREA_CLASS = "resize-y bg-background font-mono text-xs";

export function AppClient() {
  const { repo, repoId, owner, name } = useRepo();
  const appName = repo.rootDirectory?.split("/").pop();
  const updateConfig = useMutation(
    api.githubRepos.updateConfig,
  ).withOptimisticUpdate((localStore, args) => {
    const { repoId: _id, ...safeFields } = args;
    patchLoadedQuery(
      localStore,
      api.githubRepos.getByOwnerAndName,
      { owner, name, appName },
      (current) => current && { ...current, ...safeFields },
    );
  });

  const saveConfig = (args: Parameters<typeof updateConfig>[0]) => {
    void catchMutationError(
      updateConfig(args),
      "Couldn't save app settings",
      "app-config-save",
    );
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

      <EvaConfigSection />
    </SettingsPage>
  );
}
