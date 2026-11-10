"use client";

import { Input, SettingsField, SettingsSection } from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { isAppRepo } from "../_utils";
import { DomainsSection } from "./DomainsSection";

type UpdateRepoConfig = (args: {
  repoId: Id<"githubRepos">;
  deploymentProjectName?: string;
  domains?: string[];
}) => void;

export function AppSettingsSection({
  repoId,
  appLabel,
  repo,
  updateConfig,
}: {
  repoId: Id<"githubRepos">;
  appLabel: string;
  repo: {
    rootDirectory?: string;
    deploymentProjectName?: string;
    domains?: string[];
  };
  updateConfig: UpdateRepoConfig;
}) {
  return (
    <SettingsSection
      title="This app"
      description={
        <>
          Only for{" "}
          <span className="font-medium text-foreground">{appLabel}</span>.
        </>
      }
    >
      <div className="grid gap-5">
        {isAppRepo(repo) ? (
          <SettingsField
            label="Deployment project"
            description="Vercel or Netlify project name. Matches the right preview in monorepos."
          >
            <Input
              className="h-9"
              placeholder="e.g. my-vercel-project"
              defaultValue={repo.deploymentProjectName ?? ""}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val !== (repo.deploymentProjectName ?? "")) {
                  updateConfig({
                    repoId,
                    deploymentProjectName: val || undefined,
                  });
                }
              }}
            />
          </SettingsField>
        ) : null}

        <DomainsSection
          repoId={repoId}
          domains={repo.domains ?? []}
          updateConfig={updateConfig}
        />
      </div>
    </SettingsSection>
  );
}
