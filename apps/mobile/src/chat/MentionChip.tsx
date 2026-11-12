import { mentionTokensToChipLinks, parseMentionChipHref, type MentionChipKind } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconX } from "@tabler/icons-react-native";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { Pressable, Text } from "react-native";
import type { ComposerPick } from "@/chat/useMentionComposer";
import { useScheme } from "@/ui/theme";

/** The web `MENTION_CHIP_CLASS`: `bg-accent text-accent-foreground`, `text-xs font-medium`, `rounded-full`. */
function useChipColors() {
  const theme = EVA_THEME[useScheme()];
  return { background: theme.accent, foreground: theme.accentForeground };
}

const CHIP_TEXT = { fontSize: 12, lineHeight: 16, fontWeight: "500" } as const;

/** A composer chip is tappable, so its label is `text-sm` (14 / 20), the phone floor, not the web `text-xs`. */
const TAPPABLE_CHIP_TEXT = { ...CHIP_TEXT, fontSize: 14, lineHeight: 20 } as const;

function chipText(kind: MentionChipKind, label: string): string {
  return `${kind === "slash" ? "/" : "@"}${label}`;
}

/**
 * A sent user message, as the web `ReviewCommentMessage` text: markdown in
 * `text-sm`, each `@` mention and `/` skill token a chip. The chip sits in the
 * line as a nested `Text` (no-break spaces pad it, as the kit's inline code),
 * so it wraps with the words. The web chip also opens what it names; the
 * phone has no screen for a doc or a skill, so it does not.
 */
export function UserMessageText({ content }: { content: string }) {
  const colors = useChipColors();
  return (
    <Markdown
      leading="normal"
      renderLink={(href, text) => {
        const chip = parseMentionChipHref(href);
        if (!chip) return undefined;
        return (
          <Text
            className="font-instrument-sans-medium"
            style={{ ...CHIP_TEXT, color: colors.foreground, backgroundColor: colors.background, borderRadius: 999 }}
          >
            {`\u00A0${chipText(chip.kind, text)}\u00A0`}
          </Text>
        );
      }}
    >
      {mentionTokensToChipLinks(content)}
    </Markdown>
  );
}

/**
 * The picks in the draft as the web editor's chips. A React Native
 * `TextInput` cannot hold a chip, so the field keeps the readable `@Ada` /
 * `/review` text and the chips sit above it, beside any attachments. A tap on
 * a chip (it shows ×) takes the pick out of the field. 32 high, the slop makes
 * it 44, only up and down: the chips sit 4 apart.
 */
export function ComposerMentionChips({ picks, onRemove }: { picks: ComposerPick[]; onRemove: (pick: ComposerPick) => void }) {
  const colors = useChipColors();
  return picks.map((pick) => {
    const text = chipText(pick.kind, pick.label);
    return (
      <Pressable
        key={`${pick.kind}:${pick.label}`}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${text}`}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={() => onRemove(pick)}
        className="h-8 max-w-full flex-row items-center gap-1 rounded-full pl-2.5 pr-2 active:opacity-70"
        style={{ backgroundColor: colors.background }}
      >
        <Text numberOfLines={1} className="shrink font-instrument-sans-medium" style={{ ...TAPPABLE_CHIP_TEXT, color: colors.foreground }}>
          {text}
        </Text>
        <IconX size={12} color={colors.foreground} />
      </Pressable>
    );
  });
}
