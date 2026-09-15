import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Skeleton,
} from "@eva/ui";
import { IconPlus, IconUsers } from "@tabler/icons-react";
import { TeamDeleteDialog } from "./_components/TeamDeleteDialog";
import { TeamCard } from "./_components/TeamCard";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

export function TeamsClient() {
  const teams = useQuery(api.teams.list);
  const createTeam = useMutation(api.teams.create);
  const deleteTeam = useMutation(api.teams.remove).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.teams.list, {});
      if (current !== undefined) {
        localStore.setQuery(
          api.teams.list,
          {},
          current.filter((team) => team._id !== args.id),
        );
      }
    },
  );

  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"teams">;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const altHeld = useAltHeld();

  const handleDelete = async (
    target: { id: Id<"teams">; name: string } | null = deleteTarget,
  ) => {
    if (!target) return;
    setIsDeleting(true);
    try {
      await withMutationToast(
        deleteTeam({ id: target.id }),
        "Team deleted",
        "Couldn't delete team",
        "team-delete",
      );
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
    }
    setIsDeleting(false);
  };

  const [createDialog, setCreateDialog] = useState({
    open: false,
    name: "",
    error: "",
    isSubmitting: false,
  });

  const handleCreate = async () => {
    if (!createDialog.name.trim()) {
      setCreateDialog((prev) => ({ ...prev, error: "Team name is required" }));
      return;
    }

    setCreateDialog((prev) => ({ ...prev, error: "", isSubmitting: true }));

    try {
      await createTeam({ name: createDialog.name });
      setCreateDialog({
        open: false,
        name: "",
        error: "",
        isSubmitting: false,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create team";
      setCreateDialog((prev) => ({
        ...prev,
        error: errorMessage,
        isSubmitting: false,
      }));
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCreateDialog({
        open: false,
        name: "",
        error: "",
        isSubmitting: false,
      });
    } else {
      setCreateDialog((prev) => ({ ...prev, open: true }));
    }
  };

  const openCreate = () => handleOpenChange(true);

  return (
    <SettingsPage
      title="Teams"
      stack={false}
      headerRight={
        <Button size="sm" onClick={openCreate}>
          <IconPlus size={16} />
          New Team
        </Button>
      }
    >
      {teams === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 border border-border" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={24} />}
          title="No teams yet"
          description="Create a team to collaborate on codebases."
          actionLabel="Create Team"
          onAction={openCreate}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team, index) => (
            <ListEnter key={team._id} index={index}>
              <TeamCard
                team={team}
                onDelete={(target) =>
                  requestConfirm(
                    altHeld,
                    () => setDeleteTarget(target),
                    () => {
                      void handleDelete(target);
                    },
                  )
                }
              />
            </ListEnter>
          ))}
        </div>
      )}

      <Dialog open={createDialog.open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={createDialog.name}
              onChange={(e) =>
                setCreateDialog((prev) => ({
                  ...prev,
                  name: e.target.value,
                  error: "",
                }))
              }
              placeholder="Team name"
              disabled={createDialog.isSubmitting}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            {createDialog.error ? (
              <div className="rounded-surface border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{createDialog.error}</p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createDialog.isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createDialog.isSubmitting}>
              {createDialog.isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamDeleteDialog
        team={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete()}
        isDeleting={isDeleting}
      />
    </SettingsPage>
  );
}
