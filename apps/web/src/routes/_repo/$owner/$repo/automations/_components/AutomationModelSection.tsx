import type { FunctionArgs } from "convex/server";
import { api, normalizeAIModel, type Doc } from "@eva/backend";
import { ModelPicker, SettingsSection, SettingsToggleRow } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAutomationOwnerProviderAccounts,
  useAvailableAiModels,
} from "@/lib/hooks/useAvailableAiModels";

/**
 * The Model section of every automation's settings, custom and built-in: the
 * model and the account runs bill to (the creator's own, or a teammate's
 * shared one). One component so the two pages cannot drift.
 */
export function AutomationModelSection({
  automation,
  commit,
}: {
  automation: Doc<"automations">;
  commit: (
    fields: Pick<
      FunctionArgs<typeof api.automations.update>,
      "model" | "providerAccountId"
    >,
  ) => void;
}) {
  const { repo, repoId } = useRepo();
  const model = normalizeAIModel(automation.model ?? repo.defaultModel);
  const { options } = useAvailableAiModels(repoId, model);
  const accounts = useAutomationOwnerProviderAccounts(automation._id);
  return (
    <SettingsSection title="Model" bodyVariant="list">
      <SettingsToggleRow
        title="Provider and model"
        action={
          <ModelPicker
            value={model}
            options={options}
            onValueChange={(next) => commit({ model: next })}
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
