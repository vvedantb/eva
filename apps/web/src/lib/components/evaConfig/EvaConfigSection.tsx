"use client";

import { SettingsSection } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { EvaConfigManagedNote } from "./EvaConfigReadOnly";
import { SetUpWithEvaButton } from "./SetUpWithEvaButton";

/**
 * Where an app's run commands live: a link to the repo's `.eva/config.json`,
 * or "Set up with Eva" when the repo has none. Settings show no commands.
 */
export function EvaConfigSection() {
  const { repo } = useRepo();
  const evaConfig = repo.evaConfig;

  return (
    <SettingsSection
      title="Commands"
      action={evaConfig ? undefined : <SetUpWithEvaButton />}
    >
      {evaConfig ? (
        <EvaConfigManagedNote evaConfig={evaConfig} />
      ) : (
        <p className="text-xs text-muted-foreground">
          This repo has no <code>.eva/config.json</code> yet. Set up with Eva to
          write it.
        </p>
      )}
    </SettingsSection>
  );
}
