import { Checkbox } from "@vvedantb/ui";

export interface CodebaseCheckItem {
  key: string;
  codebase: string;
  label: string;
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
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {group.map((item) => (
            <label
              key={item.key}
              title={item.title}
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-surface px-2 py-1.5 hover:bg-muted/40"
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
        </div>
      ))}
    </div>
  );
}
