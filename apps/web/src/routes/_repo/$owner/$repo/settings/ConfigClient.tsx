"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { isMonorepoCodebase } from "./_utils";
import { AppSettingsSection } from "./_components/AppSettingsSection";
import { RepositorySettingsSection } from "./_components/RepositorySettingsSection";

export function ConfigClient() {
  const { repo, repoId, owner, name } = useRepo();
  const appName = repo.rootDirectory?.split("/").pop();
  const siblingApps = useQuery(api.githubRepos.listSiblingApps, { repoId });
  const isMonorepo = isMonorepoCodebase(repo, siblingApps?.length ?? 0);
  const appLabel = appName ?? name;

  const updateConfig = useMutation(
    api.githubRepos.updateConfig,
  ).withOptimisticUpdate((localStore, args) => {
    const { repoId: _id, devPort, ...safeFields } = args;
    patchLoadedQuery(
      localStore,
      api.githubRepos.getByOwnerAndName,
      { owner, name, appName },
      (current) =>
        current && {
          ...current,
          ...safeFields,
          ...(devPort !== undefined ? { devPort: devPort ?? undefined } : {}),
        },
    );
  });

  return (
    <SettingsPage title="Repository">
      <RepositorySettingsSection
          repoId={repoId}
          owner={owner}
          name={name}
          repo={repo}
          isMonorepo={isMonorepo}
          updateConfig={updateConfig}
      />
      <AppSettingsSection
          repoId={repoId}
          appLabel={appLabel}
          repo={repo}
          updateConfig={updateConfig}
      />
    </SettingsPage>
  );
}
