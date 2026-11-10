"use client";

import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { patchLoadedQuery } from "@vvedantb/server";

/** Updates a repo's display label with optimistic list + detail cache patches. */
export function useSetRepoLabel(teamId?: Id<"teams">) {
  return useMutation(api.githubRepos.updateConfig).withOptimisticUpdate(
    (localStore, args) => {
      if (args.label === undefined) return;
      const nextLabel =
        args.label.trim().length > 0 ? args.label.trim() : undefined;

      const patchRows = <T extends { _id: Id<"githubRepos"> }>(
        rows: T[],
      ): T[] =>
        rows.map((row) =>
          row._id === args.repoId ? { ...row, label: nextLabel } : row,
        );

      const list = localStore.getQuery(api.githubRepos.list, {});
      if (list !== undefined) {
        localStore.setQuery(api.githubRepos.list, {}, patchRows(list));
      }

      const resolvedTeamId =
        teamId ?? list?.find((row) => row._id === args.repoId)?.teamId;
      if (resolvedTeamId !== undefined) {
        patchLoadedQuery(
          localStore,
          api.githubRepos.listByTeam,
          { teamId: resolvedTeamId },
          patchRows,
        );
      }

      const detailSource =
        list ??
        (resolvedTeamId !== undefined
          ? localStore.getQuery(api.githubRepos.listByTeam, {
              teamId: resolvedTeamId,
            })
          : undefined);

      for (const row of detailSource ?? []) {
        if (row._id !== args.repoId) continue;
        const appName = row.rootDirectory?.split("/").pop();
        const queryArgs = {
          owner: row.owner,
          name: row.name,
          appName,
        };
        patchLoadedQuery(
          localStore,
          api.githubRepos.getByOwnerAndName,
          queryArgs,
          (cur) => cur && { ...cur, label: nextLabel },
        );
      }
    },
  );
}
