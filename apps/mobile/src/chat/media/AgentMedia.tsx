import { splitAgentMedia, type AgentMediaItem, type ResolvedMediaEntry } from "@eva/shared";
import { ImageViewer, Text } from "@vvedantb/native-ui/primitives";
import { InlineVideo } from "@vvedantb/native-ui/video";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { textColor, useScheme } from "@/ui/theme";

/** Space between carousel tiles, in points. */
const TILE_GAP = 8;

/**
 * Screenshots and recordings the agent left on its reply, as the web
 * `AgentMedia`, under the reply: each video as an inline player (still until
 * pressed), then every image in one sideways carousel. Each capture shows its
 * file name as a caption.
 */
export function AgentMedia({ entries }: { entries: ResolvedMediaEntry[] }) {
  const { videos, images } = splitAgentMedia(entries);
  if (videos.length === 0 && images.length === 0) return null;
  return (
    <View className="mt-2 gap-2">
      {videos.map((video, index) => (
        <View key={video.url} className="gap-1.5">
          <MediaCaption caption={video.caption} />
          <InlineVideo
            url={video.url}
            accessibilityLabel={video.caption ?? (videos.length > 1 ? `Play recording ${index + 1}` : "Play recording")}
          />
        </View>
      ))}
      <ImageCarousel images={images} />
    </View>
  );
}

/**
 * One image fills the column. More scroll sideways, each tile 70% of the
 * column so the next one peeks in. A tap opens the full-screen viewer.
 */
function ImageCarousel({ images }: { images: AgentMediaItem[] }) {
  const [columnWidth, setColumnWidth] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (images.length === 0) return null;
  const tileWidth = images.length === 1 ? columnWidth : columnWidth * 0.7;
  return (
    <View className="w-full" onLayout={(event) => setColumnWidth(event.nativeEvent.layout.width)}>
      {columnWidth > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={tileWidth + TILE_GAP}
          decelerationRate="fast"
          contentContainerStyle={{ gap: TILE_GAP }}
          scrollEnabled={images.length > 1}
        >
          {images.map((image, index) => (
            <View key={image.url} className="gap-1.5" style={{ width: tileWidth }}>
              <MediaCaption caption={image.caption} />
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel={image.caption ?? `Screenshot ${index + 1}`}
                accessibilityHint="Opens full screen"
                onPress={() => setViewerIndex(index)}
                className="active:opacity-90"
              >
                <Image
                  source={{ uri: image.url }}
                  resizeMode="contain"
                  style={{ width: tileWidth, aspectRatio: 4 / 3, borderRadius: 12 }}
                />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <ImageViewer
        images={images.map((image) => ({ url: image.url, alt: image.caption ?? undefined }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        onOpenImage={(url) => void WebBrowser.openBrowserAsync(url)}
      />
    </View>
  );
}

function MediaCaption({ caption }: { caption: string | null }) {
  const scheme = useScheme();
  if (!caption) return null;
  return (
    <Text numberOfLines={1} className="font-instrument-sans text-sm" style={textColor(scheme, "muted")}>
      {caption}
    </Text>
  );
}
