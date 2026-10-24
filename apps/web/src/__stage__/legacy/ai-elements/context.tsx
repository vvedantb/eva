"use client";

import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";

import { Button } from "../ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { Progress } from "../ui/progress";
import { cn } from "../utils/cn";

const PERCENT_MAX = 100;
const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;

/**
 * Per-category token counts. Cache reads and writes are priced very differently
 * (reads ~0.1x input, writes ~1.25x input), so they are tracked separately.
 */
interface LanguageModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputReadTokens?: number;
  cachedInputWriteTokens?: number;
}

/**
 * Pre-computed costs (USD). Pass these when the authoritative cost is known
 * (e.g. Claude returns `total_cost_usd` directly). Avoids needing a pricing
 * catalog at render time.
 */
interface ContextCosts {
  totalUSD?: number;
  inputUSD?: number;
  outputUSD?: number;
  cacheReadUSD?: number;
  cacheWriteUSD?: number;
}

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  usage?: LanguageModelUsage;
  costs?: ContextCosts;
}

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
  const context = useContext(ContextContext);

  if (!context) {
    throw new Error("Context components must be used within Context");
  }

  return context;
};

export type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

export const Context = ({
  usedTokens,
  maxTokens,
  usage,
  costs,
  ...props
}: ContextProps) => {
  const contextValue = useMemo(
    () => ({ costs, maxTokens, usage, usedTokens }),
    [costs, maxTokens, usage, usedTokens],
  );

  return (
    <ContextContext.Provider value={contextValue}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextContext.Provider>
  );
};

const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <svg
      aria-label="Model context usage"
      height="16"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="16"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
};

export type ContextTriggerProps = ComponentProps<typeof Button>;

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const renderedPercent = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button type="button" variant="ghost" size="sm" {...props}>
          <span className="font-medium text-muted-foreground text-xs tabular-nums">
            {renderedPercent}
          </span>
          <ContextIcon />
        </Button>
      )}
    </HoverCardTrigger>
  );
};

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({
  className,
  ...props
}: ContextContentProps) => (
  <HoverCardContent
    className={cn("min-w-60 divide-y overflow-hidden p-0", className)}
    {...props}
  />
);

export type ContextContentHeaderProps = ComponentProps<"div">;

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const displayPct = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);
  const used = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(usedTokens);
  const total = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(maxTokens);

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs tabular-nums">
            <p>{displayPct}</p>
            <p className="font-mono text-muted-foreground">
              {used} / {total}
            </p>
          </div>
          <div className="space-y-2">
            <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
          </div>
        </>
      )}
    </div>
  );
};

export type ContextContentBodyProps = ComponentProps<"div">;

export const ContextContentBody = ({
  children,
  className,
  ...props
}: ContextContentBodyProps) => (
  <div className={cn("w-full p-3", className)} {...props}>
    {children}
  </div>
);

const formatUSD = (value: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    // Claude's per-call cost is often sub-cent; show enough precision to be useful.
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatTokens = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => {
  const { costs } = useContextValue();
  const totalCost = costs?.totalUSD;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3 bg-secondary p-3 text-xs",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <span className="text-muted-foreground">Total cost</span>
          <span className="font-mono tabular-nums">
            {totalCost === undefined ? "—" : formatUSD(totalCost)}
          </span>
        </>
      )}
    </div>
  );
};

const UsageRow = ({
  label,
  tokens,
  costUSD,
  className,
  ...rest
}: {
  label: string;
  tokens: number;
  costUSD?: number;
} & ComponentProps<"div">) => {
  if (!tokens) return null;
  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...rest}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {formatTokens(tokens)}
        {costUSD !== undefined ? (
          <span className="ml-2 font-mono text-muted-foreground">
            {formatUSD(costUSD)}
          </span>
        ) : null}
      </span>
    </div>
  );
};

export type ContextInputUsageProps = ComponentProps<"div">;

export const ContextInputUsage = (props: ContextInputUsageProps) => {
  const { usage, costs } = useContextValue();
  return (
    <UsageRow
      label="Input"
      tokens={usage?.inputTokens ?? 0}
      costUSD={costs?.inputUSD}
      {...props}
    />
  );
};

export type ContextOutputUsageProps = ComponentProps<"div">;

export const ContextOutputUsage = (props: ContextOutputUsageProps) => {
  const { usage, costs } = useContextValue();
  return (
    <UsageRow
      label="Output"
      tokens={usage?.outputTokens ?? 0}
      costUSD={costs?.outputUSD}
      {...props}
    />
  );
};

export type ContextCacheReadUsageProps = ComponentProps<"div">;

export const ContextCacheReadUsage = (props: ContextCacheReadUsageProps) => {
  const { usage, costs } = useContextValue();
  return (
    <UsageRow
      label="Cache read"
      tokens={usage?.cachedInputReadTokens ?? 0}
      costUSD={costs?.cacheReadUSD}
      {...props}
    />
  );
};

export type ContextCacheWriteUsageProps = ComponentProps<"div">;

export const ContextCacheWriteUsage = (props: ContextCacheWriteUsageProps) => {
  const { usage, costs } = useContextValue();
  return (
    <UsageRow
      label="Cache write"
      tokens={usage?.cachedInputWriteTokens ?? 0}
      costUSD={costs?.cacheWriteUSD}
      {...props}
    />
  );
};

/**
 * @deprecated Use ContextCacheReadUsage and ContextCacheWriteUsage separately.
 * Kept for backwards compat — shows combined cache reads + writes as one row.
 */
export const ContextCacheUsage = (props: ComponentProps<"div">) => {
  const { usage, costs } = useContextValue();
  const cacheTokens =
    (usage?.cachedInputReadTokens ?? 0) + (usage?.cachedInputWriteTokens ?? 0);
  const cacheCost =
    costs?.cacheReadUSD !== undefined || costs?.cacheWriteUSD !== undefined
      ? (costs?.cacheReadUSD ?? 0) + (costs?.cacheWriteUSD ?? 0)
      : undefined;
  return (
    <UsageRow
      label="Cache"
      tokens={cacheTokens}
      costUSD={cacheCost}
      {...props}
    />
  );
};
