import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Card,
  CardContent,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@eva/ui";
import { IconTrash, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { UserInitials } from "@eva/shared/user-initials";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

type Member = FunctionReturnType<typeof api.teamMembers.list>[number];

interface TeamMembersTabProps {
  teamId: Id<"teams">;
  members: Array<Member>;
  isOwner: boolean;
}

export function TeamMembersTab({
  teamId,
  members,
  isOwner,
}: TeamMembersTabProps) {
  const currentUserId = useQuery(api.auth.me);
  const addMember = useMutation(api.teamMembers.add);
  const removeMember = useMutation(api.teamMembers.remove).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.teamMembers.list, {
        teamId: args.teamId,
      });
      if (current !== undefined) {
        localStore.setQuery(
          api.teamMembers.list,
          { teamId: args.teamId },
          current.filter((member) => member.userId !== args.userId),
        );
      }
    },
  );
  const updateRole = useMutation(
    api.teamMembers.updateRole,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.teamMembers.list, {
      teamId: args.teamId,
    });
    if (current !== undefined) {
      localStore.setQuery(
        api.teamMembers.list,
        { teamId: args.teamId },
        current.map((member) =>
          member.userId === args.userId
            ? { ...member, role: args.role }
            : member,
        ),
      );
    }
  });

  const [dialog, setDialog] = useState({
    open: false,
    email: "",
    error: "",
    isSubmitting: false,
  });

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      setDialog({ open: false, email: "", error: "", isSubmitting: false });
    } else {
      setDialog((prev) => ({ ...prev, open: true }));
    }
  };

  const handleAddMember = async () => {
    if (!dialog.email.trim()) {
      setDialog((prev) => ({ ...prev, error: "Email is required" }));
      return;
    }

    setDialog((prev) => ({ ...prev, error: "", isSubmitting: true }));

    try {
      await addMember({ teamId, userEmail: dialog.email });
      setDialog({ open: false, email: "", error: "", isSubmitting: false });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to add member";
      setDialog((prev) => ({
        ...prev,
        error: errorMessage,
        isSubmitting: false,
      }));
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {isOwner && (
          <Dialog open={dialog.open} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button size="sm">
                <IconUserPlus size={16} className="mr-1.5" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Input
                    type="email"
                    value={dialog.email}
                    onChange={(e) =>
                      setDialog((prev) => ({
                        ...prev,
                        email: e.target.value,
                        error: "",
                      }))
                    }
                    placeholder="Email address"
                    disabled={dialog.isSubmitting}
                    onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  />
                </div>
                {dialog.error && (
                  <div className="rounded-surface border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{dialog.error}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleDialogChange(false)}
                  disabled={dialog.isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddMember}
                  disabled={dialog.isSubmitting}
                >
                  {dialog.isSubmitting ? "Adding..." : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div className="space-y-2">
        {members.length === 0 ? (
          <div className="rounded-surface bg-card">
            <SettingsEmptyState
              icon={IconUsers}
              title="No members yet"
              description="Invite teammates by email to collaborate."
            />
          </div>
        ) : (
          members.map((member, index) => (
            <ListEnter key={member._id} index={index}>
              <Card>
                <CardContent className="flex items-center justify-between gap-2 p-3 sm:p-4">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <UserInitials
                      userId={member.userId}
                      hideLastSeen
                      size="md"
                    />
                    <div className="min-w-0">
                      <p data-pii className="truncate text-sm font-medium">
                        {member.user?.fullName ||
                          member.user?.email ||
                          "Unknown"}
                      </p>
                      <p
                        data-pii
                        className="truncate text-xs text-muted-foreground"
                      >
                        {member.user?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner && member.userId !== currentUserId ? (
                      <Select
                        value={member.role}
                        onValueChange={(role: "owner" | "member") =>
                          void catchMutationError(
                            updateRole({ teamId, userId: member.userId, role }),
                            "Couldn't update member role",
                            "team-member-role",
                          )
                        }
                      >
                        {/* 28px is under the comfortable tap floor, so the
                          trigger grows to 40px on touch only. */}
                        <SelectTrigger className="h-10 w-[100px] border-0 bg-secondary text-xs sm:h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">owner</SelectItem>
                          <SelectItem value="member">member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                        {member.role}
                      </span>
                    )}
                    {isOwner && member.userId !== currentUserId && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove member"
                        onClick={() =>
                          void withMutationToast(
                            removeMember({ teamId, userId: member.userId }),
                            "Member removed",
                            "Couldn't remove member",
                            "team-member-remove",
                          )
                        }
                      >
                        <IconTrash size={14} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </ListEnter>
          ))
        )}
      </div>
    </>
  );
}
