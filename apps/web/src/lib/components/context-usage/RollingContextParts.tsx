import {
  Button,
  Progress,
  RollingNumber,
  springTransition,
} from "@vvedantb/ui";
import { m } from "motion/react";
import type { ComponentProps } from "react";

// Eva's versions of the `@vvedantb/ui` ContextUsage parts that show numbers.
// The library prints plain text, so each figure here goes through
// `RollingNumber` and rolls when a turn updates it. Formats match the library.

const percentFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});
const tokenFormat = new Intl.NumberFormat("en-US", { notation: "compact" });
const usdFormat = new Intl.NumberFormat("en-US", {
  currency: "USD",
  minimumFractionDigits: 2,
  style: "currency",
});

const RING_RADIUS = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cachedInputReadTokens: number;
  cachedInputWriteTokens: number;
}

/**
 * The hover-card trigger. It rides under `HoverCardTrigger asChild`, so it
 * passes on the ref and pointer handlers it gets, or the card never opens.
 */
export function ContextMeterButton({
  ratio,
  ...props
}: ComponentProps<typeof Button> & { ratio: number }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="context-meter"
      {...props}
    >
      <RollingNumber
        value={percentFormat.format(ratio)}
        className="font-medium text-muted-foreground text-xs"
      />
      <svg
        aria-label="Model context usage"
        role="img"
        width="16"
        height="16"
        viewBox="0 0 24 24"
      >
        <circle
          cx={12}
          cy={12}
          r={RING_RADIUS}
          fill="none"
          opacity="0.25"
          stroke="currentColor"
          strokeWidth={2}
        />
        <m.circle
          cx={12}
          cy={12}
          r={RING_RADIUS}
          fill="none"
          opacity="0.7"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          initial={false}
          animate={{
            strokeDashoffset: RING_CIRCUMFERENCE * (1 - Math.min(ratio, 1)),
          }}
          transition={springTransition}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>
    </Button>
  );
}

export function ContextMeterHeader({
  usedTokens,
  maxTokens,
}: {
  usedTokens: number;
  maxTokens: number;
}) {
  const ratio = maxTokens > 0 ? usedTokens / maxTokens : 0;
  return (
    <>
      <div className="flex items-center justify-between gap-3 text-xs">
        <RollingNumber value={percentFormat.format(ratio)} />
        <span className="font-mono text-muted-foreground">
          <RollingNumber value={tokenFormat.format(usedTokens)} /> /{" "}
          {tokenFormat.format(maxTokens)}
        </span>
      </div>
      <Progress
        className="bg-surface-secondary"
        value={Math.min(ratio, 1) * 100}
      />
    </>
  );
}

export function ContextUsageRows({ usage }: { usage: UsageTokens }) {
  const rows = [
    { label: "Input", tokens: usage.inputTokens },
    { label: "Output", tokens: usage.outputTokens },
    { label: "Cache read", tokens: usage.cachedInputReadTokens },
    { label: "Cache write", tokens: usage.cachedInputWriteTokens },
  ];
  return rows.map((row) =>
    row.tokens > 0 ? (
      <div
        key={row.label}
        className="flex items-center justify-between text-xs"
      >
        <span className="text-muted-foreground">{row.label}</span>
        <RollingNumber value={tokenFormat.format(row.tokens)} />
      </div>
    ) : null,
  );
}

export function ContextCostFooter({ totalUSD }: { totalUSD: number }) {
  return (
    <>
      <span className="text-muted-foreground">Total cost</span>
      <RollingNumber value={usdFormat.format(totalUSD)} className="font-mono" />
    </>
  );
}
