"use client";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@eva/ui";
import { IconUserPlus, IconCheck } from "@tabler/icons-react";
import { getUserInitials } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import { Facehash } from "facehash";
import type { FunctionReturnType } from "convex/server";
import type { api, Id } from "@eva/backend";
import { getUserDisplayName } from "@/lib/components/tasks/_components/task-detail-constants";
import { QUICK_TASK_OPTION_BADGE_CLASS } from "@/lib/components/quick-tasks/_utils/optionBadge";

type User = FunctionReturnType<typeof api.users.listAll>[number];

export function AssigneeSelector({
  users,
  assignedTo,
  setAssignedTo,
}: {
  users: User[] | undefined;
  assignedTo: Id<"users"> | undefined;
  setAssignedTo: (id: Id<"users"> | undefined) => void;
}) {
  const assignedUser = assignedTo
    ? users?.find((u) => u._id === assignedTo)
    : undefined;

  const reviewers = (users ?? []).filter((u) => u.role === "dev");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={QUICK_TASK_OPTION_BADGE_CLASS}>
          {assignedUser ? (
            <>
              <UserInitials user={assignedUser} size="sm" hideLastSeen />
              <span data-pii className="text-foreground">
                {getUserDisplayName(assignedUser)}
              </span>
            </>
          ) : (
            <>
              <IconUserPlus size={14} />
              <span>Code Reviewer</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="unassigned"
                onSelect={() => setAssignedTo(undefined)}
              >
                <IconUserPlus size={14} className="text-muted-foreground" />
                Unassigned
                {!assignedTo && <IconCheck size={14} className="ml-auto" />}
              </CommandItem>
              {reviewers.map((user) => (
                <CommandItem
                  key={user._id}
                  value={getUserDisplayName(user)}
                  onSelect={() => setAssignedTo(user._id)}
                >
                  <Facehash
                    size={16}
                    name={getUserInitials(user)}
                    enableBlink
                  />
                  <span data-pii>{getUserDisplayName(user)}</span>
                  {assignedTo === user._id && (
                    <IconCheck size={14} className="ml-auto" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
