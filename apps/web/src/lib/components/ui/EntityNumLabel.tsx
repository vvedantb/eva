import { cn } from "@eva/ui";
import { formatEntityNumLabel } from "@/lib/numId";

export function EntityNumLabel({
  numId,
  projectNumId,
  className,
}: {
  numId?: number;
  projectNumId?: number;
  className?: string;
}) {
  const label = formatEntityNumLabel({ numId, projectNumId });
  if (!label) return null;

  return (
    <span
      className={cn(
        "shrink-0 font-mono text-2xs font-normal tabular-nums text-muted-foreground/55",
        className,
      )}
    >
      {label}
    </span>
  );
}
