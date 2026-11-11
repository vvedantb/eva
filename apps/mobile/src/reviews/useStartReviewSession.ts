import { api, type Id } from "@eva/backend";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";

/**
 * Starts the session a review action asks for (Revert, a blocker's fix) and
 * opens its chat, as the web `sessions.create` then navigate: a titled
 * session on the branch the work must land on, through `mobile.startSession`.
 * The chat is pushed, so Back returns to the pull request.
 */
export function useStartReviewSession(repoId: Id<"githubRepos">): {
  /** `onStarted` runs before the chat opens, so a confirm can close and not wait behind it. */
  start: (request: { title: string; message: string; baseBranch: string }, onStarted?: () => void) => void;
  starting: boolean;
} {
  const router = useRouter();
  const startSession = useMutation(api.mobile.startSession);
  const [starting, setStarting] = useState(false);
  const start = (request: { title: string; message: string; baseBranch: string }, onStarted?: () => void) => {
    if (starting) return;
    setStarting(true);
    startSession({ repoId, title: request.title, prompt: request.message, baseBranch: request.baseBranch }).then(
      ({ sessionId }) => {
        setStarting(false);
        onStarted?.();
        router.push({ pathname: "/chat/[target]", params: { target: sessionId } });
      },
      (cause: Error) => {
        setStarting(false);
        toast.error(cause.message || "Couldn't start a session");
      },
    );
  };
  return { start, starting };
}
