"use client";

import { animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useDisablePageMotion } from "@/lib/components/PageMotionProvider";

/** Suffixes we will count; compound durations like "1h 12m" stay static. */
const COUNTABLE_SUFFIX = /^(?:%|h|k|m|s|ms)?$/i;

export function parseCountable(value: string | number): {
  amount: number;
  prefix: string;
  suffix: string;
  decimals: number;
} | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { amount: value, prefix: "", suffix: "", decimals: 0 };
  }
  const match = value.trim().match(/^(\D*?)(-?\d+(?:\.\d+)?)(\D*)$/);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const raw = match[2] ?? "";
  const suffix = (match[3] ?? "").trim();
  if (!COUNTABLE_SUFFIX.test(suffix)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return null;
  const decimals = raw.includes(".") ? (raw.split(".")[1]?.length ?? 0) : 0;
  return { amount, prefix, suffix, decimals };
}

/**
 * Counts from the last seen number to `value` on `--motion-base`. Same amount
 * on a Convex refresh is a no-op so the digit does not replay every write.
 * Non-numeric labels (`—`, `1h 12m`) render as-is.
 */
export function useCountUpDisplay(value: string | number): string | number {
  const parsed = parseCountable(value);
  const [display, setDisplay] = useState(value);
  const lastAmount = useRef<number | null>(null);
  const skipMotion = useDisablePageMotion();

  useEffect(() => {
    if (skipMotion) {
      lastAmount.current = parsed?.amount ?? null;
      setDisplay(value);
      return;
    }
    if (!parsed) {
      lastAmount.current = null;
      setDisplay(value);
      return;
    }
    if (lastAmount.current === parsed.amount) {
      setDisplay(value);
      return;
    }
    const from = lastAmount.current ?? 0;
    lastAmount.current = parsed.amount;
    const controls = animate(from, parsed.amount, {
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        const rounded =
          parsed.decimals > 0
            ? latest.toFixed(parsed.decimals)
            : String(Math.round(latest));
        setDisplay(`${parsed.prefix}${rounded}${parsed.suffix}`);
      },
    });
    return () => controls.stop();
  }, [
    parsed?.amount,
    parsed?.prefix,
    parsed?.suffix,
    parsed?.decimals,
    skipMotion,
    value,
  ]);

  return display;
}
