import type { CSSProperties, ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "@eva/ui";

const DOTS = ["red", "amber", "green"];

interface FriWindowProps {
  label?: ReactNode;
  /** Sits at the right of the title bar: device buttons, counters, chips. */
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}

/**
 * Every mock in the Friday deck sits in this frame: a soft dark panel with a
 * three-dot title bar.
 *
 * Radii are written as explicit pixels on both sides of a nested pair. This app
 * sets `--radius: 1rem`, so `rounded-lg` computes to 16px, which is wrong next
 * to a 20px shell with 16px of padding — the inner corner has to be 4px for the
 * two to stay concentric.
 */
export function FriWindow({
  label,
  trailing,
  children,
  className,
  bodyClassName,
  style,
}: FriWindowProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[20px] bg-white/[0.045] ring-1 ring-white/10",
        className,
      )}
      style={style}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        {DOTS.map((dot) => (
          <span
            key={dot}
            aria-hidden
            className="size-2 rounded-full bg-white/15"
          />
        ))}
        {label === undefined ? null : (
          <span className="ml-2 truncate text-[11px] text-white/40">
            {label}
          </span>
        )}
        {trailing === undefined ? null : (
          <div className="ml-auto flex items-center gap-1.5">{trailing}</div>
        )}
      </div>
      <div className={cn("min-h-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Grey bars standing in for text the room is not meant to read. */
export function FriLines({
  widths,
  className,
  height = 8,
}: {
  widths: readonly number[];
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {widths.map((width, index) => (
        <span
          key={`${width}-${index}`}
          aria-hidden
          className="rounded-[4px] bg-white/[0.09]"
          style={{ width, height }}
        />
      ))}
    </div>
  );
}

export function FriChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/60",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface FriTypedProps {
  text: string;
  run?: boolean;
  delay?: number;
  duration?: number;
  className?: string;
  caret?: boolean;
}

/**
 * A sentence appearing as if typed. The reveal is a `clipPath` wipe rather than
 * a growing width, so the line never reflows underneath itself.
 */
export function FriTyped({
  text,
  run = true,
  delay = 0.25,
  duration = 1.1,
  className,
  caret = true,
}: FriTypedProps) {
  return (
    <span className="inline-flex items-center">
      <m.span
        className={cn("whitespace-nowrap", className)}
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: run ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
        transition={{
          duration: run ? duration : 0.2,
          ease: "linear",
          delay: run ? delay : 0,
        }}
      >
        {text}
      </m.span>
      {caret ? (
        <m.span
          aria-hidden
          className="ml-1 inline-block h-[1.05em] w-[2px] rounded-full bg-white/70"
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{
            duration: 1,
            times: [0, 0.5, 0.5, 1],
            ease: "linear",
            repeat: Infinity,
          }}
        />
      ) : null}
    </span>
  );
}
