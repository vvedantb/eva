import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@eva/ui";
import { IconPlus, IconFolder } from "@tabler/icons-react";
import { TeamRepoCard } from "./TeamRepoCard";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { catchMutationError } from "@/lib/utils/mutationToast";

type Repo = FunctionReturnType<typeof api.githubRepos.listByTeam>[number];

interface TeamReposTabProps {
  teamId: Id<"teams">;
  repos: Array<Repo>;
  allRepos: Array<Repo>;
  isOwner: boolean;
}

export function TeamReposTab({
  teamId,
  repos,
  allRepos,
  isOwner,
}: TeamReposTabProps) {
  const assignRepo = useMutation(
    api.githubRepos.assignToTeam,
  ).withOptimisticUpdate((localStore, args) => {
    const currentTeamRepos = localStore.getQuery(api.githubRepos.listByTeam, {
      teamId: args.teamId,
    });
    const currentAllRepos = localStore.getQuery(api.githubRepos.list, {
      includeHidden: true,
    });
    const assignedRepo = currentAllRepos?.find((r) => r._id === args.repoId);
    if (currentTeamRepos !== undefined && assignedRepo) {
      localStore.setQuery(api.githubRepos.listByTeam, { teamId: args.teamId }, [
        ...currentTeamRepos,
        { ...assignedRepo, teamId: args.teamId },
      ]);
    }
    if (currentAllRepos !== undefined) {
      localStore.setQuery(
        api.githubRepos.list,
        { includeHidden: true },
        currentAllRepos.map((r) =>
          r._id === args.repoId ? { ...r, teamId: args.teamId } : r,
        ),
      );
    }
  });
  const removeRepo = useMutation(
    api.githubRepos.removeFromTeam,
  ).withOptimisticUpdate((localStore, args) => {
    const currentTeamRepos = localStore.getQuery(api.githubRepos.listByTeam, {
      teamId: args.teamId,
    });
    if (currentTeamRepos !== undefined) {
      localStore.setQuery(
        api.githubRepos.listByTeam,
        { teamId: args.teamId },
        currentTeamRepos.filter((repo) => repo._id !== args.repoId),
      );
    }
    const currentAllRepos = localStore.getQuery(api.githubRepos.list, {
      includeHidden: true,
    });
    if (currentAllRepos !== undefined) {
      localStore.setQuery(
        api.githubRepos.list,
        { includeHidden: true },
        currentAllRepos.map((r) =>
          r._id === args.repoId ? { ...r, teamId: undefined } : r,
        ),
      );
    }
  });

  const [dialog, setDialog] = useState({
    open: false,
    selectedRepoId: "",
    error: "",
    isSubmitting: false,
  });

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setDialog({
        open: false,
        selectedRepoId: "",
        error: "",
        isSubmitting: false,
      });
    } else {
      setDialog((prev) => ({ ...prev, open: true }));
    }
  };

  const handleAddRepo = async () => {
    if (!dialog.selectedRepoId) {
      setDialog((prev) => ({
        ...prev,
        error: "Please select a repository",
      }));
      return;
    }

    const foundRepo = allRepos.find((r) => r._id === dialog.selectedRepoId);
    if (!foundRepo) {
      setDialog((prev) => ({ ...prev, error: "Repository not found" }));
      return;
    }

    setDialog((prev) => ({ ...prev, error: "", isSubmitting: true }));

    try {
      await assignRepo({ teamId, repoId: foundRepo._id });
      setDialog({
        open: false,
        selectedRepoId: "",
        error: "",
        isSubmitting: false,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add repository";
      setDialog((prev) => ({
        ...prev,
        error: errorMessage,
        isSubmitting: false,
      }));
    }
  };

  const availableRepos = allRepos.filter((r) => r.teamId !== teamId);

  return (
    <>
      <div className="mb-4 flex justify-end">
        {isOwner && (
          <Dialog open={dialog.open} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <IconPlus size={16} className="mr-1.5" />
                Add Repository
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Repository</DialogTitle>
                <DialogDescription>
                  Assign a codebase to this team.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {availableRepos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No unassigned codebases available.
                  </p>
                ) : (
                  <Select
                    value={dialog.selectedRepoId}
                    onValueChange={(value) =>
                      setDialog((prev) => ({
                        ...prev,
                        selectedRepoId: value,
                        error: "",
                      }))
                    }
                    disabled={dialog.isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRepos.map((repo) => (
                        <SelectItem key={repo._id} value={repo._id}>
                          {repo.owner}/{repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {dialog.error ? (
                  <div className="rounded-surface border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{dialog.error}</p>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => handleDialogChange(false)}
                  disabled={dialog.isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddRepo}
                  disabled={dialog.isSubmitting || availableRepos.length === 0}
                >
                  {dialog.isSubmitting ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="space-y-2">
        {repos.length === 0 ? (
          <div className="rounded-surface bg-card">
            <SettingsEmptyState
              icon={IconFolder}
              title="No codebases yet"
              description="Assign a repository to this team."
            />
          </div>
        ) : (
          repos.map((repo, index) => (
            <ListEnter key={repo._id} index={index}>
              <TeamRepoCard
                repo={repo}
                teamId={teamId}
                isOwner={isOwner}
                onRemove={(repoId) =>
                  void catchMutationError(
                    removeRepo({ teamId, repoId }),
                    "Couldn't remove repository",
                    "team-repo-remove",
                  )
                }
              />
            </ListEnter>
          ))
        )}
      </div>
    </>
  );
}
