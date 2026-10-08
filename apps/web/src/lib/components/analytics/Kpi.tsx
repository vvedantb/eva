"use client";

import { Children, type ReactNode } from "react";
import { m } from "motion/react";
import { Card, CardContent, cn, motionBase, motionStagger } from "@eva/ui";
import {
  type Icon as TablerIcon,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from "@tabler/icons-react";
import { useCountUpDisplay } from "./useCountUpDisplay";

interface KpiProps {
  /** Optional leading icon shown in a rounded pill next to the label. */
  icon?: TablerIcon;
  label: string;
  value: string | number;
  /** Small supporting text: under the value when stacked, inline beside the label when row. */
  subtitle?: string;
  /** Provide both current and previous to render a trend chip (stacked layout only). */
  previousValue?: number;
  currentValue?: number;
  /**
   * "stacked" (default): label/icon header, optional trend chip, then large value.
   * "row": compact layout with the icon pill on the left and value + label on the right.
   */
  layout?: "stacked" | "row";
  /** Bumps the value text size; used for primary/hero cards in either layout. */
  size?: "default" | "lg";
}

/**
 * Trend chip rendered to the right of the label: green for a rise, red for a
 * fall, muted for no change. Mirrors the HeroUI KPI.Trend look.
 */
function TrendBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  if (previous === 0 && current === 0) return null;

  const diff =
    previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0
        ? 100
        : 0;

  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
        <IconMinus size={12} />
        0%
      </span>
    );
  }

  const isPositive = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        isPositive
          ? "bg-success/10 text-success"
          : "bg-destructive/10 text-destructive"
      }`}
    >
      {isPositive ? (
        <IconTrendingUp size={12} />
      ) : (
        <IconTrendingDown size={12} />
      )}
      {isPositive ? "+" : ""}
      {diff}%
    </span>
  );
}

/**
 * A single key-performance-indicator card: label + optional icon in the header,
 * an optional trend chip, then a large value with an optional subtitle.
 * Modelled on the HeroUI KPI component, styled with our design tokens.
 */
export function Kpi({
  icon: Icon,
  label,
  value,
  subtitle,
  previousValue,
  currentValue,
  layout = "stacked",
  size = "default",
}: KpiProps) {
  const showTrend = previousValue !== undefined && currentValue !== undefined;
  const displayValue = useCountUpDisplay(value);

  if (layout === "row") {
    return (
      <Card className="h-full transition-[background-color] duration-[var(--motion-base)] hover:bg-muted/40">
        <CardContent className="flex h-full flex-row items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
          {Icon && (
            <div className="motion-base rounded-lg bg-secondary p-1.5 text-muted-foreground sm:p-2">
              <Icon size={18} className="sm:h-5 sm:w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "font-bold tabular-nums text-foreground",
                size === "lg" ? "text-xl sm:text-3xl" : "text-lg sm:text-2xl",
              )}
            >
              {displayValue}
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xs text-muted-foreground sm:text-sm">
                {label}
              </p>
              {subtitle && (
                <span className="text-xs text-muted-foreground/60">
                  {subtitle}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <Icon size={18} />
              </span>
            )}
            <span className="truncate text-sm font-medium text-muted-foreground">
              {label}
            </span>
          </div>
          {showTrend && (
            <TrendBadge current={currentValue} previous={previousValue} />
          )}
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold tabular-nums tracking-tight text-foreground",
              size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl",
            )}
          >
            {displayValue}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Responsive grid wrapper for a row of {@link Kpi} cards. Defaults to 1 column
 * on mobile, 2 on small screens, 4 on large; override with `className`.
 */
export function KpiGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {Children.map(children, (child, index) => (
        <m.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...motionBase, delay: motionStagger(index) }}
        >
          {child}
        </m.div>
      ))}
    </div>
  );
}
