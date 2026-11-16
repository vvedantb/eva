import { splitAgentMedia, type ResolvedMediaEntry } from "@eva/shared";
import { ImageGallery } from "@vvedantb/native-ui/primitives";
import { InlineVideo } from "@vvedantb/native-ui/video";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";

/**
 * Screenshots and recordings the agent left on its reply, as the web
 * `AgentMedia`, under the reply: each video as an inline player (still until
 * pressed), then the images as one gallery that opens the full-screen viewer.
 */
export function AgentMedia({ entries }: { entries: ResolvedMediaEntry[] }) {
  const { videos, images } = splitAgentMedia(entries);
  if (videos.length === 0 && images.length === 0) return null;
  return (
    <View className="mt-2 gap-2">
      {videos.map((url, index) => (
        <InlineVideo key={url} url={url} accessibilityLabel={videos.length > 1 ? `Play recording ${index + 1}` : "Play recording"} />
      ))}
      {images.length > 0 ? (
        <ImageGallery images={images.map((url) => ({ url }))} onOpenImage={(url) => void WebBrowser.openBrowserAsync(url)} />
      ) : null}
    </View>
  );
}
