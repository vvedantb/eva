import type { FunctionArgs } from "convex/server";
import {
  api,
  normalizeAIModel,
  type Doc,
  type StoredModelTraits,
} from "@eva/backend";
import { SettingsSection, SettingsToggleRow } from "@vvedantb/ui";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAutomationOwnerProviderAccounts,
  useAvailableAiModels,
} from "@/lib/hooks/useAvailableAiModels";

/**
 * The Model section of every automation's settings, custom and built-in: the
 * model, its traits (reasoning, thinking, context, fast) and the account runs
 * bill to (the creator's own, or a teammate's shared one). It uses the same
 * `ModelSelectWithTraits` as the composer and the quick task modal. Unset
 * traits show, and run with, the repo's defaults.
 */
export function AutomationModelSection({
  automation,
  commit,
}: {
  automation: Doc<"automations">;
  commit: (
    fields: Pick<
      FunctionArgs<typeof api.automations.update>,
      | "model"
      | "providerAccountId"
      | "reasoningLevel"
      | "thinkingEnabled"
      | "use1mContext"
      | "fastMode"
    >,
  ) => void;
}) {
  const { repo, repoId } = useRepo();
  const model = normalizeAIModel(automation.model ?? repo.defaultModel);
  const { options } = useAvailableAiModels(repoId, model);
  const accounts = useAutomationOwnerProviderAccounts(automation._id);
  const traits: StoredModelTraits = {
    effortLevel: automation.reasoningLevel ?? repo.defaultReasoningLevel,
    thinkingEnabled: automation.thinkingEnabled ?? repo.defaultThinkingEnabled,
    use1mContext: automation.use1mContext ?? repo.defaultUse1mContext,
    fastMode: automation.fastMode ?? repo.defaultFastMode,
  };
  return (
    <SettingsSection title="Model" bodyVariant="list">
      <SettingsToggleRow
        title="Provider and model"
        action={
          <ModelSelectWithTraits
            value={model}
            options={options}
            onValueChange={(next) => commit({ model: next })}
            traits={traits}
            onTraitsChange={(partial) =>
              commit({
                reasoningLevel: partial.effortLevel,
                thinkingEnabled: partial.thinkingEnabled,
                use1mContext: partial.use1mContext,
                fastMode: partial.fastMode,
              })
            }
            accounts={accounts.options}
            accountId={automation.providerAccountId ?? null}
            onAccountChange={(id) =>
              commit({ providerAccountId: accounts.resolveId(id) ?? null })
            }
          />
        }
      />
    </SettingsSection>
  );
}
