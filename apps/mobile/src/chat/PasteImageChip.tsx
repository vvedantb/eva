import { Suggestion, Suggestions } from "@vvedantb/native-ui/ai";
import { useClipboardHasImage } from "@/chat/clipboardImage";

/**
 * "Paste image" over the composer while the clipboard holds an image (user
 * choice): React Native's text box takes no pasted image, as the web's does,
 * so one tap attaches the clipboard's image instead. The kit suggestion chip.
 */
export function PasteImageChip({ onPaste }: { onPaste: () => void }) {
  const hasImage = useClipboardHasImage();
  if (!hasImage) return null;
  return (
    <Suggestions className="pb-2" contentContainerClassName="px-3">
      <Suggestion suggestion="Paste image" onPress={onPaste} testID="paste-image-chip" />
    </Suggestions>
  );
}
