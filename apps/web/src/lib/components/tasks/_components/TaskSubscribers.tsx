"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  CrossfadeIcon,
  motionFast,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { IconBell, IconBellOff, IconUserPlus } from "@tabler/icons-react";
import { getUserInitials } from "@eva/shared";
import { UserInitials } from "@eva/shared/user-initials";
import { Facehash } from "facehash";
import { getUserDisplayName } from "./task-detail-constants";

type Users = FunctionReturnType<typeof api.users.listAll>;

/**
 * Sits on the task detail tabs row and shows who follows the task. Subscribers
 * are notified of comments, meaningful status changes, and PR events. The self
 * toggle manages the current user's subscription; the picker adds or removes
 * teammates.
 */
export function TaskSubscribers({
  taskId,
  users,
}: {
  taskId: Id<"agentTasks">;
  users: Users | undefined;
}) {
  const currentUserId = useQuery(api.auth.me);
  const subscribers = useQuery(api.taskSubscribers.listByTask, { taskId });
  const setSubscription = useMutation(api.taskSubscribers.setSubscription);

  if (subscribers === undefined) return null;

  const subscriberIds = new Set(subscribers.map((sub) => sub.userId));
  const subscribedUsers = (users ?? []).filter((user) =>
    subscriberIds.has(user._id),
  );
  const isSubscribed =
    currentUserId !== undefined &&
    currentUserId !== null &&
    subscriberIds.has(currentUserId);
  // Anyone in the workspace can follow or be added to a task, not just devs
  // (unlike the code-reviewer assignee picker, which is dev-only).
  const manageableUsers = users ?? [];

  return (
    // Wraps because this row shares a flex line with the "Activity" label in
    // the task detail, and the avatar stack grows with the subscriber count.
    <div className="flex max-sm:min-w-0 max-sm:flex-wrap items-center gap-2">
      <Button
        variant={isSubscribed ? "secondary" : "outline"}
        size="sm"
        className="h-10 gap-1.5 sm:h-7"
        disabled={currentUserId === undefined || currentUserId === null}
        onClick={() =>
          void setSubscription({ taskId, subscribed: !isSubscribed })
        }
      >
        <CrossfadeIcon
          show={isSubscribed}
          variant="soft"
          trueKey="subscribed"
          falseKey="subscribe"
          className="relative flex size-3.5 shrink-0 items-center justify-center"
          whenTrue={<IconBellOff size={14} />}
          whenFalse={<IconBell size={14} />}
        />
        {isSubscribed ? "Subscribed" : "Subscribe"}
      </Button>

      {subscribedUsers.length > 0 && (
        <div className="flex items-center -space-x-1">
          <AnimatePresence initial={false} mode="popLayout">
            {subscribedUsers.map((user) => (
              <m.span
                key={user._id}
                className="inline-flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <UserInitials user={user} size="sm" hideLastSeen />
              </m.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            // 28px on desktop, as before; `icon-sm` is 32px and only wanted on touch.
            className="text-muted-foreground sm:size-7"
            aria-label="Manage subscribers"
          >
            <IconUserPlus size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Manage subscribers</DropdownMenuLabel>
          {manageableUsers.map((user) => (
            <DropdownMenuCheckboxItem
              key={user._id}
              checked={subscriberIds.has(user._id)}
              onCheckedChange={(checked) =>
                void setSubscription({
                  taskId,
                  userId: user._id,
                  subscribed: checked,
                })
              }
            >
              <div className="flex items-center gap-1.5">
                <Facehash size={16} name={getUserInitials(user)} enableBlink />
                <span data-pii>{getUserDisplayName(user)}</span>
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
