import { DropdownMenuItem } from "@vvedantb/ui";
import { IconSparkles } from "@tabler/icons-react";

/** "Recap chat" in the quick task and project "…" menus (`useRecapChat`). */
export function RecapChatMenuItem({ onSelect }: { onSelect: () => void }) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <IconSparkles size={14} />
      Recap chat
    </DropdownMenuItem>
  );
}
