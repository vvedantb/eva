import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlus } from "@tabler/icons-react-native";
import { PromptInputButton } from "@vvedantb/native-ui/ai";
import { useScheme } from "@/ui/theme";

/**
 * The pill composer's + (attach), as Eva's web compact `ComposerPlusMenu`
 * trigger: `bg-muted text-foreground`. Shared by the chat and the new session.
 */
export function AttachButton({ onPress }: { onPress: () => void }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <PromptInputButton
      variant="secondary"
      icon={IconPlus}
      label="Add attachment"
      iconColor={theme.foreground}
      style={{ backgroundColor: theme.muted }}
      onPress={onPress}
    />
  );
}
