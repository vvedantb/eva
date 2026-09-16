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
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@eva/ui";
import { IconTrash, IconUsers } from "@tabler/icons-react";
import { UserInitials } from "@eva/shared/user-initials";
import { SettingsEmptyState } from "@/lib/components/settings/SettingsEmptyState";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";
import { requestConfirm, skipConfirmTitle, useAltHeld } from "@/lib/confirm";
import { AddTeamMemberDialog } from "./AddTeamMemberDialog";
import {
  RemoveMemberDialog,
  type RemoveMemberTarget,
} from "./RemoveMemberDialog";

type Member = FunctionReturnType<typeof api.teamMembers.list>[number];

interface TeamMembersTabProps {
  teamId: Id<"teams">;
  teamName: string;
  members: Array<Member>;
  isOwner: boolean;
}

/** The row's own label, so the confirmation names whoever the user just saw. */
function memberLabel(member: Member): string {
  return member.user?.fullName || member.user?.email || "this member";
}

export function TeamMembersTab({
  teamId,
  teamName,
  members,
  isOwner,
}: TeamMembersTabProps) {
  const currentUserId = useQuery(api.auth.me);
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

  const [removeTarget, setRemoveTarget] = useState<
    (RemoveMemberTarget & { userId: Member["userId"] }) | null
  >(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const altHeld = useAltHeld();

  const runRemove = (userId: Member["userId"]) => {
    setIsRemoving(true);
    // `withMutationToast` rethrows after toasting; the dialog closes either way
    // because the optimistic list already rolled back on failure.
    void withMutationToast(
      removeMember({ teamId, userId }),
      "Member removed",
      "Couldn't remove member",
      "team-member-remove",
    )
      .catch(() => undefined)
      .then(() => {
        setRemoveTarget(null);
        setIsRemoving(false);
      });
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {isOwner ? <AddTeamMemberDialog teamId={teamId} /> : null}
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
                        title={skipConfirmTitle("Remove member")}
                        onClick={(event) =>
                          requestConfirm(
                            altHeld,
                            () =>
                              setRemoveTarget({
                                userId: member.userId,
                                label: memberLabel(member),
                                teamName,
                              }),
                            () => runRemove(member.userId),
                            event,
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

      <RemoveMemberDialog
        target={removeTarget}
        isRemoving={isRemoving}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) runRemove(removeTarget.userId);
        }}
      />
    </>
  );
}
