import type { MentionItem } from "@eva/shared";
import { Suggestion, Suggestions } from "@vvedantb/native-ui/ai";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { useClipboardHasImage } from "@/chat/clipboardImage";

/** The row fades in as a chip arrives (the kit popover's 150 ms); Reduce Motion skips it. */
const CHIP_ENTER = FadeIn.duration(150).reduceMotion(ReduceMotion.System);

const NO_SKILLS: readonly MentionItem[] = [];

/**
 * The kit suggestion chips over the composer, in one row:
 *
 * - "Paste image" while the clipboard holds an image (user choice): one tap
 *   attaches it, as the web's paste. The text box takes a pasted image too
 *   (`PromptInput` `onPasteImages`); the chip saves the long press.
 * - The web `SkillSuggestionChips` (`useSkillSuggestions`): one chip per
 *   skill Eva suggests for the draft, `/label` (the kit chip has no icon for
 *   the web sparkles). A tap adds the same `/skill` pick the `/` picker would.
 */
export function ComposerSuggestions({
  onPaste,
  skills = NO_SKILLS,
  onPickSkill,
}: {
  onPaste: () => void;
  skills?: readonly MentionItem[];
  onPickSkill?: (item: MentionItem) => void;
}) {
  const hasImage = useClipboardHasImage();
  if (!hasImage && skills.length === 0) return null;
  return (
    <Animated.View entering={CHIP_ENTER}>
      <Suggestions className="pb-2" contentContainerClassName="px-3">
        {hasImage ? <Suggestion suggestion="Paste image" onPress={onPaste} testID="paste-image-chip" /> : null}
        {skills.map((skill) => (
          <Suggestion key={skill.id} suggestion={`Add /${skill.label} to your message`} onPress={() => onPickSkill?.(skill)}>
            {`/${skill.label}`}
          </Suggestion>
        ))}
      </Suggestions>
    </Animated.View>
  );
}
