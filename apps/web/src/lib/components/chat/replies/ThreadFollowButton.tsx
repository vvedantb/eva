"use client";

import { useMutation } from "convex/react";
import { IconCheck } from "@tabler/icons-react";
import { Button, toast } from "@vvedantb/ui";
import { api } from "@eva/backend";
import type { ThreadReadState } from "@eva/shared/chatReadState";

/**
 * Follow or Unfollow a reply thread, in its header. Following: its replies
 * notify you. An @mention notifies you either way. Not a participant
 * (`state` null): Follow. Nothing while the state loads.
 */
export function ThreadFollowButton({
  rootId,
  state,
}: {
  rootId: string;
  state: ThreadReadState | undefined;
}) {
  const setFollowing = useMutation(api.threads.setFollowing);
  if (state === undefined) return null;
  const following = state?.following ?? false;
  const toggle = () => {
    setFollowing({ rootId, following: !following }).catch(() =>
      toast.error("Could not change this thread's notifications."),
    );
  };
  return following ? (
    <Button size="xs" variant="secondary" onClick={toggle}>
      <IconCheck />
      Following
    </Button>
  ) : (
    <Button size="xs" variant="ghost" onClick={toggle}>
      Follow
    </Button>
  );
}
