import { api } from "@eva/backend";
import type { ThreadReadState } from "@eva/shared/chatReadState";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCheck } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { useScheme } from "@/ui/theme";

/**
 * Follow or Unfollow a reply thread, in the thread screen's header, as the
 * web `ThreadFollowButton`: its replies notify you while you follow; an
 * @mention notifies you either way. Not a participant (`state` null):
 * Follow. Nothing while the state loads.
 */
export function ThreadFollowButton({ rootId, state }: { rootId: string; state: ThreadReadState | undefined }) {
  const theme = EVA_THEME[useScheme()];
  const setFollowing = useMutation(api.threads.setFollowing);
  if (state === undefined) return null;
  const following = state?.following ?? false;
  const toggle = () => {
    setFollowing({ rootId, following: !following }).catch(() => toast.error("Couldn't change this thread's notifications"));
  };
  return following ? (
    <Button
      size="sm"
      variant="secondary"
      fullWidth={false}
      leftIcon={<IconCheck size={14} color={theme.foreground} />}
      onPress={toggle}
    >
      Following
    </Button>
  ) : (
    <Button size="sm" variant="ghost" fullWidth={false} onPress={toggle}>
      Follow
    </Button>
  );
}
