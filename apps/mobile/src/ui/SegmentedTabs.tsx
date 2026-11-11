import { EVA_THEME } from "@eva/shared/evaTheme";
import { Tabs, TabsList, TabsTrigger } from "@vvedantb/native-ui/primitives";
import { useLargerText } from "@vvedantb/native-ui/theme";
import { useScheme } from "@/ui/theme";

/**
 * A full-width list switch, the web `tabs-segmented` list (`SessionsListModeTabs`,
 * `ReviewsListStateTabs`): its look and dark card trough, with 32-high
 * triggers for a thumb in place of the web `sm` 24 (the slop reaches 44).
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
        style={scheme === "dark" ? { backgroundColor: EVA_THEME.dark.card } : undefined}
      >
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} className="flex-1" minHeight={largerText ? undefined : 32}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
