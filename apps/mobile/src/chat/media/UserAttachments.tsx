import { attachmentFileKind, isImageContentType, labelForAttachment, type AttachmentFileKind } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFile, IconFileTypeTxt, IconHtml, IconMarkdown, type IconProps } from "@tabler/icons-react-native";
import { MONO_FONT } from "@vvedantb/native-ui/ai";
import { ImageViewer, Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, Text } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import * as WebBrowser from "expo-web-browser";
import { useState, type ComponentType } from "react";
import { Image, Pressable, View } from "react-native";
import { useScheme } from "@/ui/theme";

/** The web `iconForAttachment`. */
const FILE_ICONS: Record<AttachmentFileKind, ComponentType<IconProps>> = {
  markdown: IconMarkdown,
  html: IconHtml,
  text: IconFileTypeTxt,
  file: IconFile,
};

/**
 * A user message's attachments, as the web `UserMessageAttachments`, above
 * the text in the bubble: 96 square image thumbs that open the full-screen
 * viewer at that image (images only take part), and a chip per text file
 * (its icon and name) that loads the file and shows it read-only in a sheet,
 * the web's read-only text modal.
 */
export function UserAttachments({ attachments }: { attachments: Array<{ url: string; contentType: string | null }> }) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ title: string; text: string } | null>(null);
  if (attachments.length === 0) return null;
  const images = attachments.filter((item) => isImageContentType(item.contentType)).map((item) => ({ url: item.url, alt: "Attached image" }));

  const openText = async (url: string, title: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        toast.error("Could not load attachment.");
        return;
      }
      setViewer({ title, text: await response.text() });
    } catch {
      toast.error("Could not load attachment.");
    }
  };

  return (
    <>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {attachments.map((item) => {
          if (isImageContentType(item.contentType)) {
            const galleryIndex = images.findIndex((image) => image.url === item.url);
            return (
              <Pressable
                key={item.url}
                accessibilityRole="imagebutton"
                accessibilityLabel="Attached image"
                accessibilityHint="Opens full screen"
                onPress={() => setViewerIndex(galleryIndex)}
                className="h-24 w-24 overflow-hidden rounded-2xl active:opacity-90"
                style={{ backgroundColor: theme.muted, borderWidth: 1, borderColor: theme.border }}
              >
                <Image source={{ uri: item.url }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
              </Pressable>
            );
          }
          const Icon = FILE_ICONS[attachmentFileKind(undefined, item.contentType)];
          const label = labelForAttachment(undefined, item.contentType);
          return (
            <Pressable
              key={item.url}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint="Shows the file"
              onPress={() => void openText(item.url, label)}
              // 44 high for touch; the web chip is `px-2.5 py-1.5`, `max-w-56`.
              className="min-h-11 max-w-56 flex-row items-center gap-2 rounded-2xl px-2.5 active:opacity-70"
              style={{ backgroundColor: theme.muted, borderWidth: 1, borderColor: theme.border }}
            >
              <Icon size={16} color={theme.mutedForeground} />
              <Text numberOfLines={1} className="shrink font-instrument-sans text-sm" style={{ fontSize: 14, lineHeight: 20, color: theme.foreground }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ImageViewer
        images={images}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
        onOpenImage={(url) => void WebBrowser.openBrowserAsync(url)}
      />
      <Sheet open={viewer !== null} onOpenChange={(open) => (open ? undefined : setViewer(null))}>
        <SheetContent className="gap-3 px-3">
          <SheetHeader className="px-2">
            <SheetTitle>{viewer?.title ?? ""}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Text selectable className="px-2" style={{ fontFamily: MONO_FONT, fontSize: 13, lineHeight: 20, color: theme.foreground }}>
              {viewer?.text ?? ""}
            </Text>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
