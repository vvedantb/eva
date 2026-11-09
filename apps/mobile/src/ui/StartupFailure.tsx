import { IconAlertTriangle } from "@tabler/icons-react-native";
import { Button } from "@vvedantb/native-ui/button";
import { EmptyState } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { View } from "react-native";
import { useScheme } from "@/ui/theme";

/** Shown when the app cannot start, so a cold start never ends on a blank screen. */
export function StartupFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const scheme = useScheme();
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: tokens.color.background[scheme] }}>
      <EmptyState
        icon={IconAlertTriangle}
        title="Could not start Eva"
        description={message}
        action={onRetry ? <Button onPress={onRetry}>Try again</Button> : undefined}
      />
    </View>
  );
}
