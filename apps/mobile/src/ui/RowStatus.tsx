import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconHelpCircle } from "@tabler/icons-react-native";
import { LoadingState, StatusDot, type StatusTone } from "@vvedantb/native-ui/primitives";
import { useIsFocused } from "expo-router";
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
 * "Eva is working": the web `LoadingState` Drive grid (`size="sm"`,
 * `iconOnly`) a row shows while a turn runs. It holds still while its screen
 * is not focused, so a background tab runs no frame clock.
 */
export function WorkingMark() {
  const focused = useIsFocused();
  return <LoadingState label="Working" size="sm" colors={WORKING_COLORS} paused={!focused} />;
}

/**
 * Eva's web `LoadingState` column colours (packages/ui `foundations.ts`): the
 * brand purple, its oklab mix with blue, then blue, left to right. The same
 * in every theme, as on the web.
 */
const WORKING_COLORS: readonly [string, string, string] = ["#8B3FB8", "#6f61c8", "#3B7DD8"];

/**
 * A row's leading status, in the web `SessionStatusLeading` order: the
 * question mark while Eva waits on an answer, else the working grid while a
 * turn runs, else the status dot. One fixed-width slot, so titles line up.
 */
export function RowStatus({
  awaitingAnswer,
  working,
  tone,
}: {
  awaitingAnswer: boolean;
  working: boolean;
  tone: StatusTone;
}) {
  return (
    <View className="w-[18px] items-center">
      {awaitingAnswer ? <AwaitingAnswerMark /> : working ? <WorkingMark /> : <StatusDot tone={tone} size="md" />}
    </View>
  );
}
