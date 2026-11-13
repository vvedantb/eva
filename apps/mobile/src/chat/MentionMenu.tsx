import type { MentionItem, MentionKind } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconChecklist, IconFileText, IconLayoutKanban, IconTerminal2, type IconProps } from "@tabler/icons-react-native";
import { PromptInputMenu, PromptInputMenuItem } from "@vvedantb/native-ui/ai";
import { ProviderIcon } from "@vvedantb/native-ui/brand";
import { Avatar, AvatarFallback, initials } from "@vvedantb/native-ui/primitives";
import type { ComponentType } from "react";
import type { MentionMenuState } from "@/chat/useMentionComposer";
import { useScheme } from "@/ui/theme";

/** The web picker's kind glyphs (document, terminal, board, checklist) as Tabler icons. */
const KIND_ICON: Record<MentionKind, ComponentType<IconProps>> = {
  document: IconFileText,
  session: IconTerminal2,
  project: IconLayoutKanban,
  quickTask: IconChecklist,
};

/**
 * The web chat composer's `@` / `/` picker (titled "Mentions" and "Skills"),
 * docked above the composer: a row per match, a tap picks it. A teammate leads
 * with their initials, a data entry ends with its kind icon, a skill with its
 * source badge (a provider's with its mark). Android back closes it
 * (`onDismiss`), as Escape on the web. Give it to `PromptInput` as `menu`
 * while `useMentionComposer().menu` is set.
 */
export function MentionMenu({
  menu,
  onPick,
  onDismiss,
}: {
  menu: MentionMenuState;
  onPick: (item: MentionItem) => void;
  onDismiss: () => void;
}) {
  const scheme = useScheme();
  const slash = menu.trigger.kind === "slash";
  const muted = EVA_THEME[scheme].mutedForeground;
  const row = (item: MentionItem, index: number) => {
    const person = menu.peopleIds.has(item.id);
    const Kind = item.kind ? KIND_ICON[item.kind] : undefined;
    return (
      <PromptInputMenuItem
        key={item.id}
        prefix={person ? undefined : slash ? "/" : "@"}
        label={item.label}
        description={item.description}
        leading={
          person ? (
            <Avatar size={24}>
              <AvatarFallback>{initials(item.label)}</AvatarFallback>
            </Avatar>
          ) : undefined
        }
        trailing={Kind ? <Kind size={16} color={muted} /> : undefined}
        badge={item.badge}
        badgeIcon={item.provider ? <ProviderIcon provider={item.provider} size={11} /> : undefined}
        // The row Return picks, as the web's first (keyboard) row.
        selected={index === 0}
        onPress={() => onPick(item)}
      />
    );
  };
  return (
    <PromptInputMenu
      title={slash ? "Skills" : "Mentions"}
      empty={slash && !menu.hasAny ? "No available skills." : undefined}
      onDismiss={onDismiss}
    >
      {menu.rows.map(row)}
    </PromptInputMenu>
  );
}
