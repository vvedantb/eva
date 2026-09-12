"use client";

import {
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { Switch } from "@eva/ui";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { ConfigModelField } from "./ConfigModelField";

type RepoConfigFields = {
  defaultBaseBranch?: string;
  defaultModel?: string;
  defaultReasoningLevel?: StoredModelTraits["effortLevel"];
  defaultThinkingEnabled?: boolean;
  defaultUse1mContext?: boolean;
  defaultFastMode?: boolean;
  sandboxReadExcluded?: boolean;
};

type UpdateRepoConfig = (args: {
  repoId: Id<"githubRepos">;
  defaultBaseBranch?: string;
  defaultModel?: AIModel;
  defaultReasoningLevel?: StoredModelTraits["effortLevel"];
  defaultThinkingEnabled?: boolean;
  defaultUse1mContext?: boolean;
  defaultFastMode?: boolean;
  sandboxReadExcluded?: boolean;
}) => void;

export function RepositorySettingsSection({
  repoId,
  owner,
  name,
  repo,
  isMonorepo,
  updateConfig,
}: {
  repoId: Id<"githubRepos">;
  owner: string;
  name: string;
  repo: RepoConfigFields;
  isMonorepo: boolean;
  updateConfig: UpdateRepoConfig;
}) {
  const defaultModels = useAvailableAiModels(repoId, repo.defaultModel);

  const monorepoHint = isMonorepo ? (
    <>
      Applies to every app in{" "}
      <span className="font-medium text-foreground">
        {owner}/{name}
      </span>
      .
    </>
  ) : undefined;

  return (
    <>
      <SettingsSection title="Defaults" description={monorepoHint}>
        <div className="grid gap-5">
          <SettingsField
            label="Base branch"
            description="Used when creating quick tasks. Falls back to main."
          >
            <BranchSelect
              value={repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH}
              onValueChange={(val) =>
                updateConfig({ repoId, defaultBaseBranch: val || undefined })
              }
              className="h-9"
              placeholder="Select a branch"
            />
          </SettingsField>

          <ConfigModelField
            label="Default model"
            description="Provider, model, and traits for new tasks and sessions."
            state={defaultModels}
            traits={storedTraitsFromRepoDefaults(repo)}
            onValueChange={(nextModel) => {
              updateConfig({
                repoId,
                defaultModel: normalizeAIModel(nextModel),
              });
            }}
            onTraitsChange={(partial) => {
              updateConfig({
                repoId,
                ...(partial.effortLevel !== undefined
                  ? { defaultReasoningLevel: partial.effortLevel }
                  : {}),
                ...(partial.thinkingEnabled !== undefined
                  ? { defaultThinkingEnabled: partial.thinkingEnabled }
                  : {}),
                ...(partial.use1mContext !== undefined
                  ? { defaultUse1mContext: partial.use1mContext }
                  : {}),
                ...(partial.fastMode !== undefined
                  ? { defaultFastMode: partial.fastMode }
                  : {}),
              });
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Sandboxes"
        description={monorepoHint}
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Readable by other sandboxes"
          description="Sandboxes for other repositories you can access in Eva may clone this repository read-only. Turn off to keep it private to its own sandboxes."
          action={
            <Switch
              checked={repo.sandboxReadExcluded !== true}
              onCheckedChange={(nextOn) =>
                updateConfig({ repoId, sandboxReadExcluded: !nextOn })
              }
              aria-label="Readable by other sandboxes"
            />
          }
        />
      </SettingsSection>
    </>
  );
}
