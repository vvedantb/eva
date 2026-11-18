import { Suggestion, Suggestions } from "@vvedantb/native-ui/ai";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useClipboardHasImage } from "@/chat/clipboardImage";

/** The chip fades in when an image lands on the clipboard (the kit popover's 150 ms); Reduce Motion skips it. */
const CHIP_ENTER = FadeIn.duration(150).reduceMotion(ReduceMotion.System);

/**
 * "Paste image" over the composer while the clipboard holds an image (user
 * choice): one tap attaches the clipboard's image, as the web's paste. The
 * text box takes a pasted image too (`PromptInput` `onPasteImages`); the chip
 * saves the long press. The kit suggestion chip.
 */
export function PasteImageChip({ onPaste }: { onPaste: () => void }) {
  const hasImage = useClipboardHasImage();
  if (!hasImage) return null;
  return (
    <Animated.View entering={CHIP_ENTER}>
      <Suggestions className="pb-2" contentContainerClassName="px-3">
        <Suggestion suggestion="Paste image" onPress={onPaste} testID="paste-image-chip" />
      </Suggestions>
    </Animated.View>
  );
}
