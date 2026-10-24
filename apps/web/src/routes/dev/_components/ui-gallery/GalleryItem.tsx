import type { ReactNode } from "react";
import { cn } from "@eva/ui";

/** One labelled specimen on the UI gallery page. */
export function GalleryItem({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="font-mono text-[11px] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A titled group of specimens laid out in a wrapping grid. */
export function GalleryGroup({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className={cn("flex flex-wrap items-start gap-6", className)}>
        {children}
      </div>
    </section>
  );
}
