import type { ReactNode } from "react";
import { cn } from "@eva/ui";

interface WidgetProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * Dashboard section: title and description on the canvas, card underneath.
 * Same caption/card split as SettingsSection.
 */
export function Widget({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}: WidgetProps) {
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <section className={cn("flex h-full flex-col gap-2", className)}>
      {hasHeader ? (
        <header className="flex shrink-0 items-start justify-between gap-4 px-4">
          <div className="min-w-0">
            {title !== undefined ? (
              <h3 className="text-balance text-sm font-semibold text-foreground">
                {title}
              </h3>
            ) : null}
            {subtitle !== undefined ? (
              <p className="mt-0.5 text-sm leading-relaxed text-pretty text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions !== undefined ? (
            <div className="shrink-0">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1 rounded-surface bg-card p-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
