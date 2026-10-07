"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { Button, Card, CardContent } from "@eva/ui";
import { IconEye, IconEyeOff, IconUsers } from "@tabler/icons-react";
import { UserInitials } from "@eva/shared/user-initials";
import { useFollow } from "@/lib/contexts/FollowContext";
import { useQuantizedNow } from "@/lib/hooks/useQuantizedNow";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { describeLocation } from "../_utils";

type Member = FunctionReturnType<typeof api.teamMembers.list>[number];

/** Same window the sidebar's online avatars use, so the two never disagree. */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

function getDisplayName(user: Member["user"]): string {
  if (!user) return "Unknown";
  return (
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.fullName ||
    user.email ||
    "Unknown"
  );
}

/**
 * Who on this team is online right now, what page they are on, and a button to
 * follow them. Follow goes through the same `FollowContext` as the sidebar's
 * online avatars, so `FollowOverlay` drives the navigation either way.
 */
export function TeamActivityTab({ members }: { members: Array<Member> }) {
  const currentUserId = useQuery(api.auth.me);
  const { following, startFollowing, stopFollowing } = useFollow();

  // Presence is decided here, not in the query: the server returns a raw
  // `lastSeenAt` and only a client can re-evaluate the window as time passes.
  const now = useQuantizedNow(30_000);
  const onlineMembers = members.filter(
    (member) =>
      !!member.user?.lastSeenAt &&
      now - member.user.lastSeenAt < ONLINE_WINDOW_MS,
  );

  if (onlineMembers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <IconUsers size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nobody from this team is online right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {onlineMembers.map((member, index) => {
        const name = getDisplayName(member.user);
        const location = describeLocation(member.user?.lastSeenPath);
        const isSelf = member.userId === currentUserId;
        const isFollowing = following?.userId === member.userId;
        const canFollow = !isSelf && !!member.user?.lastSeenPath;

        return (
          <ListEnter key={member._id} index={index} fast>
            <Card>
              <CardContent className="flex items-center justify-between gap-2 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <UserInitials userId={member.userId} hideLastSeen size="md" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <span data-pii className="truncate">
                        {name}
                      </span>
                      {isSelf ? (
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-success"
                        aria-hidden
                      />
                      <span className="truncate">{location ?? "Online"}</span>
                    </p>
                  </div>
                </div>
                {isFollowing ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={stopFollowing}
                  >
                    <IconEyeOff size={14} className="mr-1.5" />
                    Stop following
                  </Button>
                ) : canFollow ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => startFollowing(member.userId, name)}
                  >
                    <IconEye size={14} className="mr-1.5" />
                    Follow
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </ListEnter>
        );
      })}
    </div>
  );
}
