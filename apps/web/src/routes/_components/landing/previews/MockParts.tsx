import type { ReactNode } from "react";
import { cn } from "@eva/ui";

/**
 * Shared furniture for the feature previews. These are deliberately static
 * stand-ins rather than the real product components: the real ones read Convex,
 * and a marketing page must render for a signed-out visitor with no data. Every
 * colour here is a design token, so the mocks follow the visitor's theme.
 */

/** Fixed body height so switching tabs never changes the panel's size. */
const MOCK_BODY_HEIGHT = "h-76";

export function MockWindow({
  title,
  trailing,
  children,
  bodyClassName,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-surface bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {title}
        </p>
        {trailing ? <div className="ml-auto shrink-0">{trailing}</div> : null}
      </div>
      <div className={cn(MOCK_BODY_HEIGHT, "overflow-hidden", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

export type MockTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "review";

const TONE_CHIP: Record<MockTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  review: "border-chart-3/30 bg-chart-3/10 text-chart-3",
};

const TONE_DOT: Record<MockTone, string> = {
  neutral: "bg-muted-foreground/50",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  review: "bg-chart-3",
};

export function MockChip({
  tone = "neutral",
  children,
}: {
  tone?: MockTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

export function MockDot({
  tone = "neutral",
  pulse,
}: {
  tone?: MockTone;
  pulse?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        TONE_DOT[tone],
        pulse ? "landing-pulse-dot" : null,
      )}
    />
  );
}

/** A row in a list-shaped mock: leading slot, label, optional meta and trailing. */
export function MockRow({
  leading,
  label,
  meta,
  trailing,
  active,
}: {
  leading?: ReactNode;
  label: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-2.5 py-2",
        active
          ? "border-border bg-muted/60"
          : "border-transparent hover:bg-muted/30",
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {label}
        </p>
        {meta ? (
          <p className="truncate text-[10.5px] text-muted-foreground">{meta}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** Skeleton text line. `width` is a Tailwind width class. */
export function MockLine({
  width = "w-full",
  tone = "muted",
}: {
  width?: string;
  tone?: "muted" | "faint";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-2 rounded-full",
        tone === "muted" ? "bg-muted-foreground/20" : "bg-muted-foreground/10",
        width,
      )}
    />
  );
}

export function MockAvatar({
  initials,
  tone = "neutral",
}: {
  initials: string;
  tone?: MockTone;
}) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
        TONE_CHIP[tone],
      )}
    >
      {initials}
    </span>
  );
}

/** Section label inside a mock panel. */
export function MockLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}
