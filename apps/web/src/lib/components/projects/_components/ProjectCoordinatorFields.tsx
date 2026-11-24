"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { IconFolders } from "@tabler/icons-react";
import {
  FieldsSection,
  FIELD_ROW_CLASS,
  FIELD_TEXT_CLASS,
} from "@/lib/components/fields/FieldsSection";
import { RepoAppMark } from "@/lib/components/RepoLogo";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { catchMutationError } from "@/lib/utils/mutationToast";

/**
 * The extra repos a project's tasks may target. A person can add only a repo
 * they can access (the list shows only those).
 */
export function ProjectCoordinatorFields({
  projectId,
  homeRepoId,
  extraRepoIds,
}: {
  projectId: Id<"projects">;
  homeRepoId: Id<"githubRepos">;
  extraRepoIds: ReadonlyArray<Id<"githubRepos">>;
}) {
  const setExtraRepoIds = useMutation(api.projects.setExtraRepoIds);
  const repos = useQuery(api.githubRepos.list, {});
  const choices = (repos ?? []).filter((repo) => repo._id !== homeRepoId);
  const selected = new Set<string>(extraRepoIds);
  const selectedRepos = choices.filter((repo) => selected.has(repo._id));

  const toggleRepo = (repoId: Id<"githubRepos">) => {
    const next = selected.has(repoId)
      ? extraRepoIds.filter((id) => id !== repoId)
      : [...extraRepoIds, repoId];
    void catchMutationError(
      setExtraRepoIds({ projectId, repoIds: next }),
      "Couldn't update repos",
      "project-extra-repos",
    );
  };

  return (
    <FieldsSection title="Repos">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* design-check-ignore-next-line — same field row as Members in ProjectFieldsPanel */}
          <button
            type="button"
            className={`${FIELD_ROW_CLASS} w-full gap-1.5 ${FIELD_TEXT_CLASS} ${selectedRepos.length === 0 ? "text-muted-foreground" : ""}`}
          >
            <IconFolders size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedRepos.length > 0
                ? selectedRepos.map(repoDisplayLabel).join(", ")
                : "Extra repos"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {choices.map((repo) => (
            <DropdownMenuCheckboxItem
              key={repo._id}
              checked={selected.has(repo._id)}
              onCheckedChange={() => toggleRepo(repo._id)}
              onSelect={(event) => event.preventDefault()}
            >
              <RepoAppMark repo={repo} />
              {repoDisplayLabel(repo)}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </FieldsSection>
  );
}
