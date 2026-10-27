"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation, useAction } from "convex/react";
import { api } from "@eva/backend";
import { Link } from "@tanstack/react-router";
import { IconUsers } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { EnvVarsTable } from "@/lib/components/EnvVarsTable";
import { SettingsEmptyState } from "@vvedantb/ui";

export function TeamEnvVarsClient() {
  const { repo } = useRepo();

  const team = useQuery(
    api.teams.get,
    repo.teamId ? { id: repo.teamId } : "skip",
  );

  const teamEnvVars = useQuery(
    api.teamEnvVars.list,
    repo.teamId ? { teamId: repo.teamId } : "skip",
  );

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
        current.filter((v) => v.key !== args.key),
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
        current.map((v) =>
          v.key === args.key
            ? { ...v, sandboxExclude: args.sandboxExclude }
            : v,
        ),
      );
    }
  });

  if (!repo.teamId || !team) {
    return (
      <div className="rounded-surface bg-card">
        <SettingsEmptyState
          icon={IconUsers}
          title="No team configured"
          description="This repository is not part of any team yet, so there are no team variables to inherit."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Which team these variables belong to reads before the variables. */}
      <div className="flex flex-wrap items-center gap-2 rounded-control border border-border px-3 py-2">
        <IconUsers size={16} className="text-muted-foreground" />
        <p className="text-xs">
          Team:{" "}
          <span className="font-medium">{team.displayName ?? team.name}</span>
        </p>
        <span className="text-muted-foreground">•</span>
        <Link
          to="/teams/$teamId"
          params={{ teamId: team._id }}
          target="_blank"
          className="text-xs text-primary hover:underline"
        >
          Manage team variables →
        </Link>
      </div>
      <EnvVarsTable
        vars={teamEnvVars}
        scope="team"
        description="Team variables inherited by every codebase. Use known slots for shared agent credentials."
        onUpsert={async (key, value, sandboxExclude) => {
          if (!repo.teamId) return;
          await upsertTeamVar({
            teamId: repo.teamId,
            key,
            value,
            sandboxExclude,
          });
        }}
        onReveal={async (key) => {
          if (!repo.teamId) return null;
          return await revealTeamValue({ teamId: repo.teamId, key });
        }}
        onRemove={async (key) => {
          if (!repo.teamId) return;
          await removeTeamVar({ teamId: repo.teamId, key });
        }}
        onToggleSandboxExclude={async (key, sandboxExclude) => {
          if (!repo.teamId) return;
          await toggleSandboxExclude({
            teamId: repo.teamId,
            key,
            sandboxExclude,
          });
        }}
      />
    </div>
  );
}
