import { api, type Id } from "@eva/backend";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconExternalLink, IconLayoutDashboard, IconThumbDown, IconThumbUp, IconTrash } from "@tabler/icons-react-native";
import { MessageAction } from "@vvedantb/native-ui/ai";
import { MediaCard } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { WEB_URL } from "@/config";
import { useScheme } from "@/ui/theme";

/**
 * An artifact the agent saved in this turn (`create_artifact`), as the web
 * `ChatArtifactCard`: its name, and its description or "Saved artifact". The
 * whole card opens the web's full-page viewer (`/artifacts/<id>`, the web's
 * "Open in new tab") in the in-app browser; the phone has no inline preview.
 */
export function ChatArtifactCard({ artifact }: { artifact: { _id: Id<"artifacts">; name: string; description?: string } }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <MediaCard
      icon={IconLayoutDashboard}
      title={artifact.name}
      description={artifact.description ?? "Saved artifact"}
      trailingIcon={IconExternalLink}
      accessibilityHint="Opens the artifact in the browser"
      onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/artifacts/${artifact._id}`)}
      backgroundColor={theme.card}
      color={theme.foreground}
      mutedColor={theme.mutedForeground}
    />
  );
}

/**
 * Feedback the agent sent in this turn (`submit_feedback`), as the web
 * `AgentFeedbackCard`: "Feedback sent", its comment, and Delete feedback.
 */
export function AgentFeedbackCard({
  feedback,
}: {
  feedback: { _id: Id<"feedback">; sentiment: FeedbackSentiment; comment?: string };
}) {
  const theme = EVA_THEME[useScheme()];
  const remove = useMutation(api.feedback.remove);
  return (
    <MediaCard
      icon={feedback.sentiment === "positive" ? IconThumbUp : IconThumbDown}
      title="Feedback sent"
      description={feedback.comment}
      backgroundColor={theme.card}
      color={theme.foreground}
      mutedColor={theme.mutedForeground}
      action={
        // A whole 44 square, as the message actions; the web's is a desktop `size-8`.
        <MessageAction
          icon={IconTrash}
          size="touch"
          label="Delete feedback"
          onPress={() => {
            remove({ feedbackId: feedback._id }).catch(() => toast.error("Could not delete feedback"));
          }}
        />
      }
    />
  );
}
