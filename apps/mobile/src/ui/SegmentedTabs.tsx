import { EVA_THEME } from "@eva/shared/evaTheme";
import { Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useScheme } from "@/ui/theme";

/**
 * A full-width list switch, the web `tabs-segmented` list (`SessionsListModeTabs`,
 * `ReviewsListStateTabs`): its track, raised thumb and dark card trough, with
 * 14 px labels on 40-high triggers for a thumb in place of the web `sm` 24
 * (the 2 slop above and below reaches 44).
 */
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
  return (
    <Tabs
      value={value}
      onValueChange={(next: string) => onChange(options.find((option) => option.value === next)?.value ?? value)}
    >
      <TabsList
        variant="segmented"
        size="sm"
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
