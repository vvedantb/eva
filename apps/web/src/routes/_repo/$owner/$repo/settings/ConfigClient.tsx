"use client";

import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { AppSettingsSection } from "./_components/AppSettingsSection";
import { RepositorySettingsSection } from "./_components/RepositorySettingsSection";

export function ConfigClient() {
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

  return (
    <SettingsPage title="Repository">
      <RepositorySettingsSection
          repoId={repoId}
          repo={repo}
          updateConfig={updateConfig}
      />
      <AppSettingsSection
          repoId={repoId}
          repo={repo}
          updateConfig={updateConfig}
      />
    </SettingsPage>
  );
}
