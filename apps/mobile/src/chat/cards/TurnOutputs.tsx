import { api, type Id } from "@eva/backend";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { buildArtifactSrcDoc, loadArtifactHtml, useArtifactBridge } from "@eva/shared/artifactBridge";
import { IconExternalLink, IconLayoutDashboard, IconMaximize, IconThumbDown, IconThumbUp, IconTrash, IconX } from "@tabler/icons-react-native";
import { MessageAction } from "@vvedantb/native-ui/ai";
import { CenteredSpinner, MediaCard, Text } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { HtmlView, type HtmlViewHandle } from "@vvedantb/native-ui/webview";
import { useMutation, useQuery } from "convex/react";
import * as WebBrowser from "expo-web-browser";
import { Suspense, use, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_URL } from "@/config";
import { useScheme } from "@/ui/theme";

/**
 * An artifact the agent saved in this turn (`create_artifact`), as the web
 * `ChatArtifactCard`: its name, and its description or "Saved artifact".
 * Collapsed until tapped, as the web, because a live artifact runs its own
 * scripts: the tap shows it in the chat (480 high, the web's preview), and
 * again hides it. Fullscreen fills the screen with it; the other icon opens
 * the web's full-page viewer in the in-app browser.
 */
export function ChatArtifactCard({ artifact }: { artifact: { _id: Id<"artifacts">; name: string; description?: string } }) {
  const theme = EVA_THEME[useScheme()];
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <View className="gap-2">
      <MediaCard
        icon={IconLayoutDashboard}
        title={artifact.name}
        description={artifact.description ?? "Saved artifact"}
        onPress={() => setExpanded(!expanded)}
        accessibilityHint={expanded ? "Hides the artifact" : "Shows the artifact"}
        backgroundColor={theme.card}
        color={theme.foreground}
        mutedColor={theme.mutedForeground}
        action={
          <View className="flex-row">
            <MessageAction icon={IconMaximize} size="touch" label="Fullscreen" onPress={() => setFullscreen(true)} />
            <MessageAction
              icon={IconExternalLink}
              size="touch"
              label="Open in browser"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/artifacts/${artifact._id}`)}
            />
          </View>
        }
      />
      {expanded && !fullscreen ? (
        <View className="overflow-hidden rounded-2xl" style={{ height: ARTIFACT_PREVIEW_HEIGHT, backgroundColor: ARTIFACT_PAGE_FILL }}>
          <ArtifactPreview artifact={artifact} height={ARTIFACT_PREVIEW_HEIGHT} />
        </View>
      ) : null}
      {fullscreen ? <ArtifactFullscreen artifact={artifact} onClose={() => setFullscreen(false)} /> : null}
    </View>
  );
}

/** The web preview's `h-[480px]`. */
const ARTIFACT_PREVIEW_HEIGHT = 480;
/** The web frame's `bg-white`: artifacts are written for a white page. */
const ARTIFACT_PAGE_FILL = "#ffffff";

/** The artifact on the whole screen: its name and Close above it, as the web's fullscreen card. */
function ArtifactFullscreen({ artifact, onClose }: { artifact: { _id: Id<"artifacts">; name: string }; onClose: () => void }) {
  const theme = EVA_THEME[useScheme()];
  const insets = useSafeAreaInsets();
  const [bodyHeight, setBodyHeight] = useState(0);
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View className="flex-1" style={{ paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.background }}>
        <View className="flex-row items-center gap-2 px-3 py-1">
          <Text numberOfLines={1} className="flex-1 font-instrument-sans-medium text-base" style={{ color: theme.foreground }}>
            {artifact.name}
          </Text>
          <MessageAction icon={IconX} size="touch" label="Close" onPress={onClose} />
        </View>
        <View
          className="flex-1"
          style={{ backgroundColor: ARTIFACT_PAGE_FILL }}
          onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
        >
          {bodyHeight > 0 ? <ArtifactPreview artifact={artifact} height={bodyHeight} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** The live artifact: its signed URL (`artifacts.get`, resolved on first preview, as the web), then its page. */
function ArtifactPreview({ artifact, height }: { artifact: { _id: Id<"artifacts">; name: string }; height: number }) {
  const withUrl = useQuery(api.artifacts.get, { id: artifact._id });
  if (withUrl === undefined) return <CenteredSpinner label="Loading artifact" />;
  if (!withUrl?.url) return <ArtifactNote text="Artifact has no content URL." />;
  return (
    <Suspense fallback={<CenteredSpinner label="Loading dashboard…" />}>
      <ArtifactPage artifactId={artifact._id} url={withUrl.url} title={artifact.name} height={height} />
    </Suspense>
  );
}

/**
 * The artifact's HTML in the sandboxed WebView, with the cowork bridge: the
 * shared shim (`buildArtifactSrcDoc`) and host (`useArtifactBridge`), so its
 * tool calls and saved state work as on the web.
 */
function ArtifactPage({ artifactId, url, title, height }: { artifactId: Id<"artifacts">; url: string; title: string; height: number }) {
  const result = use(loadArtifactHtml(url));
  const page = useRef<HtmlViewHandle>(null);
  const { onMessage } = useArtifactBridge(artifactId, page);
  if (!result.ok) return <ArtifactNote text={result.error} tone="error" />;
  return (
    <HtmlView
      ref={page}
      html={buildArtifactSrcDoc(result.html)}
      title={title}
      height={height}
      onOpenLink={(link) => void WebBrowser.openBrowserAsync(link)}
      onPageMessage={onMessage}
    />
  );
}

function ArtifactNote({ text, tone }: { text: string; tone?: "error" }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="flex-1 items-center justify-center p-4">
      <Text className="font-instrument-sans text-sm" style={{ color: tone === "error" ? theme.destructive : theme.mutedForeground }}>
        {text}
      </Text>
    </View>
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
