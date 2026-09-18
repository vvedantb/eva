"use client";

import { useState } from "react";
import { useQueryStates } from "nuqs";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  cn,
} from "@eva/ui";
import { IconPlus, IconX } from "@tabler/icons-react";
import { RepoLogo } from "@/lib/components/RepoLogo";
import { useRepo } from "@/lib/contexts/RepoContext";
import { repoDisplayLabel } from "@/lib/utils/repoGrouping";
import { repoTileColor } from "@/lib/utils/repoTileColor";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  linkedRepoIdsParser,
  repoGroupIdParser,
  installDependenciesParser,
} from "@/lib/search-params";
import { ComposerAppSwitcher } from "./ComposerAppSwitcher";
import {
  ForeignGroupRow,
  OwnGroupRow,
  PickerSectionLabel,
  PickerSeparator,
  RepoRow,
} from "./CodebasesPickerList";
import {
  pickableCodebaseRepos,
  resolveRepoGroupId,
  resolveRepoIds,
  type CodebaseGroup,
} from "../_utils";

/**
 * Shared URL-backed selection for the new-session "linked codebases" picker.
 * Read by both {@link CodebasesPicker} (to render) and `NewSessionComposer`
 * (to build the `sessions.create` args), so both stay in sync through nuqs
 * without prop drilling.
 */
export function useCodebasesSelection() {
  const [params, setParams] = useQueryStates({
    linked: linkedRepoIdsParser,
    group: repoGroupIdParser,
    deps: installDependenciesParser,
  });
  const repos = useQuery(api.githubRepos.list, {}) ?? [];
  const groups = useQuery(api.repoGroups.listMine, {}) ?? [];

  const linkedRepoIds = resolveRepoIds(repos, params.linked);
  const repoGroupId = resolveRepoGroupId(groups, params.group);
  const linkedRepos = linkedRepoIds
    .map((id) => repos.find((repo) => repo._id === id))
    .filter((repo): repo is (typeof repos)[number] => repo !== undefined);

  return {
    repos,
    groups,
    linkedRepoIds,
    linkedRepos,
    repoGroupId,
    installDependencies: params.deps !== "0",
    /** Ad-hoc pick/remove — always clears the saved-group binding. */
    setLinkedRepoIds: (ids: Id<"githubRepos">[]) => {
      void setParams({ linked: ids, group: "" });
    },
    /** Applies a saved group's membership verbatim. */
    applyGroup: (group: CodebaseGroup) => {
      void setParams({
        linked: group.linkedRepoIds.map(String),
        group: String(group._id),
        deps: group.installDependencies === false ? "0" : "1",
      });
    },
    setInstallDependencies: (value: boolean) => {
      void setParams({ deps: value ? "1" : "0" });
    },
    /** Binds the current ad-hoc selection to a just-saved group, without
     * touching `linked`/`deps` — the saved group has that exact membership. */
    bindToGroup: (id: Id<"repoGroups">) => {
      void setParams({ group: String(id) });
    },
    clear: () => {
      void setParams({ linked: [], group: "" });
    },
  };
}

function LinkedRepoChip({
  repo,
  onRemove,
}: {
  repo: { owner: string; name: string; rootDirectory?: string; label?: string; logoUrl?: string | null };
  onRemove: () => void;
}) {
  const label = repoDisplayLabel(repo);
  return (
    <span className="inline-flex min-w-0 max-w-40 items-center gap-1 rounded-full bg-muted py-0.5 pl-1 pr-1.5 text-sm text-foreground">
      <RepoLogo
        logoUrl={repo.logoUrl}
        size={16}
        fallback={
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white",
              repoTileColor(`${repo.owner}/${repo.name}/${label}`),
            )}
          >
            {label.charAt(0).toUpperCase()}
          </span>
        }
      />
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <IconX size={11} />
      </button>
    </span>
  );
}

/**
 * The landing composer's app switcher, extended with linked-repo chips and an
 * "Add codebase" popover (multi-repo sessions). The primary repo itself is
 * still switched via {@link ComposerAppSwitcher}; this only adds/removes the
 * repos cloned alongside it.
 */
export function CodebasesPicker() {
  const { repo: primary } = useRepo();
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const codebases = useCodebasesSelection();
  const createGroup = useMutation(api.repoGroups.create);
  const updateGroup = useMutation(api.repoGroups.update);
  const removeGroup = useMutation(api.repoGroups.remove);

  const ownGroups = codebases.groups.filter(
    (group) => group.primaryRepoId === primary._id,
  );
  const foreignGroups = codebases.groups.filter(
    (group) => group.primaryRepoId !== primary._id,
  );
  const pickable = pickableCodebaseRepos(codebases.repos, primary);

  const toggleRepo = (repoId: Id<"githubRepos">) => {
    const isSelected = codebases.linkedRepoIds.includes(repoId);
    codebases.setLinkedRepoIds(
      isSelected
        ? codebases.linkedRepoIds.filter((id) => id !== repoId)
        : [...codebases.linkedRepoIds, repoId],
    );
  };

  const handleSaveGroup = async () => {
    const name = groupName.trim();
    if (!name || codebases.linkedRepoIds.length === 0) return;
    // try/catch (not a bare `.catch`) because the result feeds the next step —
    // React Compiler is fine with this shape (no throw/ternary/&&/loop in the
    // try itself, and a catch is present).
    try {
      const id = await catchMutationError(
        createGroup({
          name,
          primaryRepoId: primary._id,
          linkedRepoIds: codebases.linkedRepoIds,
          installDependencies: codebases.installDependencies,
        }),
        "Couldn't save codebase group",
        "repo-group-create",
      );
      setGroupName("");
      codebases.bindToGroup(id);
    } catch {
      // Already toasted by catchMutationError.
    }
  };

  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
      <ComposerAppSwitcher />
      {codebases.linkedRepos.map((repo) => (
        <LinkedRepoChip
          key={repo._id}
          repo={repo}
          onRemove={() => toggleRepo(repo._id)}
        />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
          >
            <IconPlus size={13} />
            Add codebase
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <div className="max-h-80 overflow-y-auto">
            {ownGroups.length > 0 || foreignGroups.length > 0 ? (
              <>
                <PickerSectionLabel>Saved groups</PickerSectionLabel>
                {ownGroups.map((group) => (
                  <OwnGroupRow
                    key={group._id}
                    group={group}
                    active={codebases.repoGroupId === group._id}
                    onPick={() => {
                      codebases.applyGroup(group);
                      setOpen(false);
                    }}
                    onRename={(name) => {
                      void catchMutationError(
                        updateGroup({ id: group._id, name }),
                        "Couldn't rename codebase group",
                        "repo-group-rename",
                      );
                    }}
                    onDelete={() => {
                      void catchMutationError(
                        removeGroup({ id: group._id }),
                        "Couldn't delete codebase group",
                        "repo-group-delete",
                      );
                      if (codebases.repoGroupId === group._id) {
                        codebases.clear();
                      }
                    }}
                  />
                ))}
                {foreignGroups.map((group) => (
                  <ForeignGroupRow key={group._id} group={group} />
                ))}
                <PickerSeparator />
              </>
            ) : null}

            <PickerSectionLabel>Repositories</PickerSectionLabel>
            {pickable.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No other repositories available
              </p>
            ) : (
              pickable.map((candidate) => (
                <RepoRow
                  key={candidate._id}
                  repo={candidate}
                  primary={primary}
                  selected={codebases.linkedRepos}
                  isSelected={codebases.linkedRepoIds.includes(candidate._id)}
                  onToggle={() => toggleRepo(candidate._id)}
                />
              ))
            )}
          </div>

          {codebases.linkedRepoIds.length > 0 ? (
            <>
              <PickerSeparator />
              <label className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                <span className="text-muted-foreground">
                  Install dependencies
                </span>
                <Switch
                  checked={codebases.installDependencies}
                  onCheckedChange={codebases.setInstallDependencies}
                />
              </label>
              {codebases.repoGroupId === null ? (
                <form
                  className="mt-1 flex items-center gap-1.5 px-2 pb-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveGroup();
                  }}
                >
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Save as group…"
                    className="h-8 text-sm"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={!groupName.trim()}
                  >
                    Save
                  </Button>
                </form>
              ) : null}
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </span>
  );
}
