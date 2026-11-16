import { EVA_THEME } from "@eva/shared/evaTheme";
import { Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { Easing, ReduceMotion, useDerivedValue, withTiming } from "react-native-reanimated";
import { useScheme } from "@/ui/theme";

/**
 * A full-width list switch, the web `tabs-segmented` list (`SessionsListModeTabs`,
 * `ReviewsListStateTabs`): its track, raised thumb and dark card trough, with
 * 14 px labels on 40-high triggers for a thumb in place of the web `sm` 24
 * (the 2 slop above and below reaches 44). The thumb slides to the picked
 * tab as the web pill does (`--tabs-dur` 200 ms, `--tabs-ease`), at once with
 * Reduce Motion.
 */

/** The web `--tabs-dur` and `--tabs-ease` (tokens.css). */
const THUMB_SLIDE = { duration: 200, easing: Easing.bezier(0.22, 1, 0.36, 1), reduceMotion: ReduceMotion.System };
export function SegmentedTabs<Value extends string>({
  value,
  options,
  onChange,
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  const scheme = useScheme();
  const largerText = useLargerText();
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  // The list's one sliding thumb follows the selected index, however it changes.
  const progress = useDerivedValue(() => withTiming(index, THUMB_SLIDE));
  return (
    <Tabs
      value={value}
      onValueChange={(next: string) => onChange(options.find((option) => option.value === next)?.value ?? value)}
    >
      <TabsList
        variant="segmented"
        size="sm"
        progress={progress}
        className="gap-0 self-stretch p-1"
        style={scheme === "light" ? undefined : { backgroundColor: EVA_THEME[scheme].card }}
      >
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} className="flex-1" minHeight={largerText ? undefined : 40}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
