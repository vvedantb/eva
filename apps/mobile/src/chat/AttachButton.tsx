import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFile, IconPhoto, IconPlus } from "@tabler/icons-react-native";
import { PromptInputButton } from "@vvedantb/native-ui/ai";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@vvedantb/native-ui/primitives";
import type { useAttachments } from "@/chat/useAttachments";
import { useScheme } from "@/ui/theme";

/**
 * The pill composer's +, as Eva's web compact `ComposerPlusMenu`: the trigger
 * is `bg-muted text-foreground`, and it opens a small menu with the web's
 * attach items, "Attach files" and "Add photos" (the web's Skills and Data
 * submenus are the phone's `/` and `@`). Shared by the chat and the new session.
 */
export function AttachButton({ attachments }: { attachments: Pick<ReturnType<typeof useAttachments>, "pick" | "pickFiles"> }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton
          variant="secondary"
          icon={IconPlus}
          label="Add to message"
          iconColor={theme.foreground}
          style={{ backgroundColor: theme.muted }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={IconFile} onSelect={() => void attachments.pickFiles()}>
          Attach files
        </DropdownMenuItem>
        <DropdownMenuItem icon={IconPhoto} onSelect={() => void attachments.pick()}>
          Add photos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
