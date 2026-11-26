import { UNARCHIVE_LABEL } from "@eva/shared";
import { Badge, Button } from "@vvedantb/native-ui/primitives";
import { View } from "react-native";

/**
 * The "Archived" state of an archived quick task or project page: its badge,
 * and Unarchive to bring it back. The page stays read-only while it shows.
 */
export function ArchivedBar({ onUnarchive }: { onUnarchive: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-2 px-4 pb-2">
      <Badge variant="secondary" className="self-center" textClassName="text-xs">
        Archived
      </Badge>
      <Button size="sm" variant="secondary" fullWidth={false} onPress={onUnarchive}>
        {UNARCHIVE_LABEL}
      </Button>
    </View>
  );
}
