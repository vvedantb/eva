"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation, useAction } from "convex/react";
import { patchLoadedQuery } from "@vvedantb/server";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { EnvVarsTable } from "@/lib/components/EnvVarsTable";

export function EnvVariablesClient() {
  const { repoId } = useRepo();
  const vars = useQuery(api.repoEnvVars.list, { repoId });
  const upsertVar = useAction(api.repoEnvVarsActions.upsertVar);
  const revealValue = useAction(api.repoEnvVarsActions.revealValue);
  const removeVar = useMutation(api.repoEnvVars.removeVar).withOptimisticUpdate(
    (localStore, args) => {
      patchLoadedQuery(localStore, api.repoEnvVars.list, { repoId }, (vars) =>
        vars.filter((v) => v.key !== args.key),
      );
    },
  );
  const toggleSandboxExclude = useMutation(
    api.repoEnvVars.toggleSandboxExclude,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(localStore, api.repoEnvVars.list, { repoId }, (vars) =>
      vars.map((v) =>
        v.key === args.key ? { ...v, sandboxExclude: args.sandboxExclude } : v,
      ),
    );
  });

  return (
    <EnvVarsTable
      vars={vars}
      scope="repo"
      onUpsert={async (key, value, sandboxExclude) => {
        await upsertVar({ repoId, key, value, sandboxExclude });
      }}
      onReveal={(key) => revealValue({ repoId, key })}
      onRemove={async (key) => {
        await removeVar({ repoId, key });
      }}
      onToggleSandboxExclude={async (key, sandboxExclude, seedOnly) => {
        await toggleSandboxExclude({ repoId, key, sandboxExclude, seedOnly });
      }}
      description="Repo variables injected into this repository's sandboxes. Use known slots for agent credentials."
    />
  );
}
