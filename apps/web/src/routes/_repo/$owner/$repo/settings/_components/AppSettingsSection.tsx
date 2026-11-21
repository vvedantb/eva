"use client";

import { useId } from "react";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsField,
  SettingsSection,
} from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import {
  DEFAULT_SANDBOX_SIZE,
  SANDBOX_SIZE_OPTIONS,
  type SandboxSize,
} from "@eva/shared";
import { isAppRepo } from "../_utils";
import { DomainsSection } from "./DomainsSection";

type UpdateRepoConfig = (args: {
  repoId: Id<"githubRepos">;
  deploymentProjectName?: string;
  domains?: string[];
  sandboxSize?: SandboxSize;
}) => void;

export function AppSettingsSection({
  repoId,
  repo,
  updateConfig,
}: {
  repoId: Id<"githubRepos">;
  repo: {
    rootDirectory?: string;
    deploymentProjectName?: string;
    domains?: string[];
    sandboxSize?: SandboxSize;
  };
  updateConfig: UpdateRepoConfig;
}) {
  const sandboxSizeFieldId = useId();
  return (
    <SettingsSection
      title="This app"
    >
      <div className="grid gap-5">
        {isAppRepo(repo) ? (
          <SettingsField
            label="Deployment project"
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

        <SettingsField
          label="Sandbox size"
          htmlFor={sandboxSizeFieldId}
          description="Applies to new sandboxes."
        >
          <Select
            value={repo.sandboxSize ?? DEFAULT_SANDBOX_SIZE}
            onValueChange={(value) => {
              const option = SANDBOX_SIZE_OPTIONS.find(
                (size) => size.value === value,
              );
              if (option) updateConfig({ repoId, sandboxSize: option.value });
            }}
          >
            <SelectTrigger id={sandboxSizeFieldId} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SANDBOX_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>

        <DomainsSection
          repoId={repoId}
          domains={repo.domains ?? []}
          updateConfig={updateConfig}
        />
      </div>
    </SettingsSection>
  );
}
