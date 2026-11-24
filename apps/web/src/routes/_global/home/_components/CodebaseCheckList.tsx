import { Checkbox } from "@vvedantb/ui";

export interface CodebaseCheckItem {
  key: string;
  /** `owner/name` heading the item is grouped under. */
  codebase: string;
  label: string;
  /** Shown on hover, e.g. the app's folder. */
  title?: string;
  checked: boolean;
}

/**
 * Codebase rows with a checkbox each, grouped under their `owner/name`.
 * Shared by "New apps found" and "Visible Codebases" so both look the same.
 */
export function CodebaseCheckList({
  items,
  onCheckedChange,
}: {
  items: ReadonlyArray<CodebaseCheckItem>;
  onCheckedChange: (item: CodebaseCheckItem, checked: boolean) => void;
}) {
  const groups = new Map<string, CodebaseCheckItem[]>();
  for (const item of items) {
    groups.set(item.codebase, [...(groups.get(item.codebase) ?? []), item]);
  }

  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
      {[...groups].map(([codebase, group]) => (
        <div key={codebase} className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{codebase}</p>
          {group.map((item) => (
            <label
              key={item.key}
              title={item.title}
              className="flex cursor-pointer items-center gap-3 rounded-surface px-2 py-1.5 hover:bg-muted/40"
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={(checked) =>
                  onCheckedChange(item, checked === true)
                }
              />
              <span className="truncate text-sm text-foreground">
                {item.label}
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
