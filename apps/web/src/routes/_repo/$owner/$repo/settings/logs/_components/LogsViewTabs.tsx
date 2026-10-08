import { Tabs, TabsList, TabsTrigger } from "@eva/ui";

type LogView = "overview" | "type" | "project";

const VIEWS: ReadonlyArray<{ value: LogView; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "type", label: "Type" },
  { value: "project", label: "Project" },
];

function isLogView(value: string): value is LogView {
  return VIEWS.some((view) => view.value === value);
}

interface LogsViewTabsProps {
  value: LogView;
  onChange: (value: LogView) => void;
}

/** Overview / Type / Project segmented control for the usage toolbar. */
export function LogsViewTabs({ value, onChange }: LogsViewTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (isLogView(next)) onChange(next);
      }}
    >
      <TabsList className="tabs-segmented h-8">
        {VIEWS.map((view) => (
          <TabsTrigger
            key={view.value}
            value={view.value}
            className="px-3 text-xs"
          >
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
