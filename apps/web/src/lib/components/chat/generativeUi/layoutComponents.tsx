import { cn, Separator, Surface } from "@eva/ui";
import type { ComponentRenderProps } from "@json-render/react";

/**
 * The containers a composed panel is built out of. Kept apart from the content
 * components so each file stays readable; both halves are assembled into one
 * registry in `renderer.tsx`.
 *
 * Tailwind needs literal class names, so every prop value maps through a
 * lookup rather than string interpolation.
 */

const GAP = { sm: "gap-2", md: "gap-3", lg: "gap-4" };
const ALIGN = {
  start: "items-start",
  center: "items-center",
  stretch: "items-stretch",
};
const COLUMNS = { 2: "grid-cols-2", 3: "grid-cols-3" };

export function StackElement({
  element,
  children,
}: ComponentRenderProps<{
  direction: "vertical" | "horizontal";
  gap: "sm" | "md" | "lg";
  align: "start" | "center" | "stretch";
}>) {
  const { direction, gap, align } = element.props;
  return (
    <div
      className={cn(
        "flex min-w-0",
        direction === "vertical" ? "flex-col" : "flex-row flex-wrap",
        GAP[gap],
        ALIGN[align],
      )}
    >
      {children}
    </div>
  );
}

export function GridElement({
  element,
  children,
}: ComponentRenderProps<{ columns: number; gap: "sm" | "md" }>) {
  const { columns, gap } = element.props;
  return (
    <div
      className={cn(
        "grid min-w-0",
        columns === 3 ? COLUMNS[3] : COLUMNS[2],
        GAP[gap],
      )}
    >
      {children}
    </div>
  );
}

export function PanelElement({
  element,
  children,
}: ComponentRenderProps<{
  title: string | null;
  description: string | null;
}>) {
  const { title, description } = element.props;
  return (
    <Surface density="tight" className="flex min-w-0 flex-col gap-2 bg-muted">
      {title ? (
        <p className="text-sm font-semibold text-foreground">{title}</p>
      ) : null}
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </Surface>
  );
}

export function SeparatorElement() {
  return <Separator className="my-1" />;
}
