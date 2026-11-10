import { useMutation, useAction } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { EnvVarsTable } from "@/lib/components/EnvVarsTable";

type TeamEnvVars = FunctionReturnType<typeof api.teamEnvVars.list>;

interface TeamEnvVarsTabProps {
  teamId: Id<"teams">;
  teamEnvVars: TeamEnvVars | undefined;
}

export function TeamEnvVarsTab({ teamId, teamEnvVars }: TeamEnvVarsTabProps) {
  const upsertTeamVar = useAction(api.teamEnvVarsActions.upsertVar);
  const revealTeamValue = useAction(api.teamEnvVarsActions.revealValue);
  const removeTeamVar = useMutation(
    api.teamEnvVars.removeVar,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.teamEnvVars.list, {
      teamId: args.teamId,
    });
    if (current !== undefined) {
      localStore.setQuery(
        api.teamEnvVars.list,
        { teamId: args.teamId },
        current.filter((envVar) => envVar.key !== args.key),
      );
    }
  });
  const toggleSandboxExclude = useMutation(
    api.teamEnvVars.toggleSandboxExclude,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.teamEnvVars.list, {
      teamId: args.teamId,
    });
    if (current !== undefined) {
      localStore.setQuery(
        api.teamEnvVars.list,
        { teamId: args.teamId },
        current.map((envVar) =>
          envVar.key === args.key
            ? { ...envVar, sandboxExclude: args.sandboxExclude }
            : envVar,
        ),
      );
    }
  });

  return (
    <EnvVarsTable
      vars={teamEnvVars}
      scope="team"
      onUpsert={async (key, value, sandboxExclude) => {
        await upsertTeamVar({ teamId, key, value, sandboxExclude });
      }}
      onReveal={(key) => revealTeamValue({ teamId, key })}
      onRemove={async (key) => {
        await removeTeamVar({ teamId, key });
      }}
      onToggleSandboxExclude={async (key, sandboxExclude, seedOnly) => {
        await toggleSandboxExclude({ teamId, key, sandboxExclude, seedOnly });
      }}
      description="Team variables inherited by every codebase. Use known slots for shared agent credentials."
    />
  );
}
