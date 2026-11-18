"use client";

import {
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import {
  Switch,
  SettingsField,
  SettingsToggleRow,
  SettingsSection,
} from "@vvedantb/ui";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { useAvailableAiModels } from "@/lib/hooks/useAvailableAiModels";
import { ConfigModelField } from "./ConfigModelField";

type RepoConfigFields = {
  defaultBaseBranch?: string;
  defaultModel?: string;
  defaultReasoningLevel?: StoredModelTraits["effortLevel"];
  defaultThinkingEnabled?: boolean;
  defaultUse1mContext?: boolean;
  defaultFastMode?: boolean;
  sandboxReadExcluded?: boolean;
  agentMemoryEnabled?: boolean;
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
  agentMemoryEnabled?: boolean;
}) => void;

export function RepositorySettingsSection({
  repoId,
  repo,
  updateConfig,
}: {
  repoId: Id<"githubRepos">;
  repo: RepoConfigFields;
  updateConfig: UpdateRepoConfig;
}) {
  const defaultModels = useAvailableAiModels(repoId, repo.defaultModel);

  return (
    <>
      <SettingsSection title="Defaults">
        <div className="grid gap-5">
          <SettingsField
            label="Base branch"
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
        bodyVariant="list"
      >
        <SettingsToggleRow
          title="Usable by other sandboxes"
          action={
            <Switch
              checked={repo.sandboxReadExcluded !== true}
              onCheckedChange={(nextOn) =>
                updateConfig({ repoId, sandboxReadExcluded: !nextOn })
              }
              aria-label="Usable by other sandboxes"
            />
          }
        />
        <SettingsToggleRow
          title="Agent memory"
          action={
            <Switch
              checked={repo.agentMemoryEnabled === true}
              onCheckedChange={(nextOn) =>
                updateConfig({ repoId, agentMemoryEnabled: nextOn })
              }
              aria-label="Agent memory"
            />
          }
        />
      </SettingsSection>
    </>
  );
}
