import { Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";

const ALL = "all";

/**
 * One filter as a segmented control, "All" first. Same control as the
 * project timeline's range toggle (`TimelineToolbar`).
 */
export function FeedbackFilter<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value | null;
  options: ReadonlyArray<{ value: Value; label: string }>;
  onChange: (value: Value | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 text-xs text-muted-foreground">{label}</span>
      <Tabs
        value={value ?? ALL}
        onValueChange={(next) =>
          onChange(options.find((option) => option.value === next)?.value ?? null)
        }
      >
        <TabsList size="sm" className="tabs-segmented" aria-label={label}>
          <TabsTrigger value={ALL} className="px-3 py-1 text-xs">
            All
          </TabsTrigger>
          {options.map((option) => (
            <TabsTrigger
              key={option.value}
              value={option.value}
              className="px-3 py-1 text-xs"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
