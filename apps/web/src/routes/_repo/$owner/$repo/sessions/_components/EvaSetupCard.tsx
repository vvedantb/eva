"use client";

import { Surface } from "@eva/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { SetUpWithEvaButton } from "@/lib/components/evaConfig/SetUpWithEvaButton";
import { EvaConfigError } from "@/lib/components/evaConfig/EvaConfigReadOnly";

/**
 * Repo-home prompt to move the repo's commands into `.eva/`. Shown while the
 * repo has no synced `.eva/config.json`, or the synced file does not parse.
 */
export function EvaSetupCard() {
  const { repo } = useRepo();
  const evaConfig = repo.evaConfig;
  if (evaConfig !== undefined && evaConfig.error === undefined) return null;

  return (
    <Surface density="tight" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {evaConfig ? "Fix your Eva config" : "Set up this repo for Eva"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Eva writes <code>.eva/config.json</code> and{" "}
            <code>.eva/mcp.json</code> to the repo, so its commands live in
            code.
          </p>
        </div>
        <SetUpWithEvaButton />
      </div>
      {evaConfig?.error ? <EvaConfigError error={evaConfig.error} /> : null}
    </Surface>
  );
}
