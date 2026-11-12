import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconHelpCircle } from "@tabler/icons-react-native";
import { StatusDot, type StatusTone } from "@vvedantb/native-ui/primitives";
import { View } from "react-native";
import { useScheme } from "@/ui/theme";

/**
 * "Eva asked you a question": the web `AwaitingAnswerMark` (warning-coloured
 * help circle), shown in place of a row's status dot.
 */
export function AwaitingAnswerMark() {
  const scheme = useScheme();
  return (
    <IconHelpCircle
      size={18}
      strokeWidth={2}
      color={EVA_THEME[scheme].warning}
      accessibilityLabel="Waiting for your answer"
    />
  );
}

/**
 * A row's leading status: the question mark while Eva waits on an answer,
 * else the status dot. One fixed-width slot, so titles line up either way.
 */
export function RowStatus({ awaitingAnswer, tone }: { awaitingAnswer: boolean; tone: StatusTone }) {
  return (
    <View className="w-[18px] items-center">
      {awaitingAnswer ? <AwaitingAnswerMark /> : <StatusDot tone={tone} size="md" />}
    </View>
  );
}
