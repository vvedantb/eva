import { cn } from "@eva/ui";
import { springTransition } from "@vvedantb/ui";
import { m } from "motion/react";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/**
 * Shows an already formatted value ("1m 05s", "42%", "$1.20") and rolls each
 * digit to its new value instead of jumping. Format the value first: this
 * component only animates the characters it gets.
 */
export function RollingNumber({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const chars = [...value];
  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      {chars.map((char, index) => {
        // Keyed from the right: when "9s" becomes "10s" the units column
        // keeps its identity and rolls, and only the new tens column mounts.
        const key = chars.length - index;
        return isDigit(char) ? (
          <DigitColumn key={key} digit={Number(char)} />
        ) : (
          <span key={key} aria-hidden className="whitespace-pre">
            {char}
          </span>
        );
      })}
    </span>
  );
}

function DigitColumn({ digit }: { digit: number }) {
  return (
    <span aria-hidden className="relative inline-block h-[1lh] overflow-hidden">
      {/* Holds the width of one digit; the moving column is absolute. */}
      <span className="invisible">0</span>
      <m.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        // The column is ten rows tall, so one row is 10% of its height.
        animate={{ y: `${-digit * 10}%` }}
        transition={springTransition}
      >
        {DIGITS.map((d) => (
          <span key={d} className="h-[1lh]">
            {d}
          </span>
        ))}
      </m.span>
    </span>
  );
}
