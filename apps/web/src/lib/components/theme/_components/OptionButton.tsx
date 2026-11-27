import { cn } from "@eva/ui";

export function OptionButton({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // The selected state is carried by a border, which assistive tech cannot
      // read — `aria-pressed` states it outright.
      aria-pressed={active}
      title={title}
      className={cn(
        // The border carries the selected state; inactive options keep a
        // transparent one so the row does not reflow on selection.
        // `min-h-10` keeps the smaller mobile padding above the 40px tap floor;
        // above `sm` the larger padding already clears it.
        "flex max-sm:min-h-10 items-center gap-2 rounded-surface border px-2.5 py-2 text-xs font-medium transition-[background-color,border-color,color] sm:gap-2.5 sm:px-3.5 sm:py-2.5 sm:text-sm",
        active
          ? "border-border bg-primary/8 text-foreground"
          : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
