import { cn } from "@eva/ui";

export function PreviewPathHistoryList({
  paths,
  selectedIndex,
  listId,
  onSelect,
}: {
  paths: string[];
  selectedIndex: number;
  listId: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Recent preview paths"
      data-preview-path-history
      className="py-1"
      onMouseDown={(event) => event.preventDefault()}
    >
      {paths.map((path, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={path}
            id={`${listId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(path);
            }}
            className={cn(
              "motion-press mx-1 flex w-[calc(100%-0.5rem)] min-w-0 items-center rounded-lg px-2 py-1.5 text-left text-xs max-sm:py-2.5 active:scale-[0.98]",
              isSelected
                ? "bg-primary/15 font-medium text-foreground dark:bg-primary/25"
                : "text-foreground/90 hover:bg-muted",
            )}
          >
            <span className="truncate">{path}</span>
          </button>
        );
      })}
    </div>
  );
}
