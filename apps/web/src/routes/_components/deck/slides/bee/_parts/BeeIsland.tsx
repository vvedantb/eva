import type { ReactNode } from "react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import { cn } from "@eva/ui";
import { DUR, EASE } from "../../../_components/motion";
import { BeeLogo } from "./BeeLogo";

/**
 * Bee's palette, from the app's `styles.css`. The island is always the app's
 * own dark surface, even on the deck's cream stage: that is how it looks on a
 * real screen.
 */
export const BEE = {
  surface: "#17140f",
  raised: "#221e17",
  text: "#f4efe6",
  muted: "#a39a8a",
  accent: "#fabe28",
  ink: "#2a1e0c",
  cream: "#fffaf0",
  line: "rgba(42,30,12,0.12)",
};

/** Bee's spring (`--spring` in the app): a slight overshoot as it settles. */
export const BEE_SPRING: Transition = {
  type: "spring",
  bounce: 0.25,
  duration: 0.7,
};

/** Three honey bars that move while Bee is listening. */
export function Waveform({ live }: { live: boolean }) {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <m.span
          key={bar}
          className="w-[3px] rounded-full"
          style={{ background: BEE.accent }}
          initial={{ height: 4 }}
          animate={
            live ? { height: [4, 16 - bar * 2, 6, 14 - bar, 4] } : { height: 4 }
          }
          transition={
            live
              ? {
                  duration: 1.1 + bar * 0.15,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: bar * 0.12,
                }
              : { duration: DUR.fast }
          }
        />
      ))}
    </span>
  );
}

interface BeeIslandProps {
  /** The line beside the logo in the pill. */
  status: ReactNode;
  /** Bars move while Bee hears speech. */
  listening?: boolean;
  /** Grows the answer panel out of the pill. */
  open?: boolean;
  /** Seconds after `open` before the panel grows. */
  openDelay?: number;
  width?: number;
  className?: string;
  /** The answer panel's contents. */
  children?: ReactNode;
}

/**
 * The notch: a pill at the top of the screen that grows downward into an
 * answer panel, as the app's `.island` does. Sized up for a slide.
 */
export function BeeIsland({
  status,
  listening = false,
  open = false,
  openDelay = 0,
  width = 560,
  className,
  children,
}: BeeIslandProps) {
  return (
    <m.div
      className={cn("overflow-hidden shadow-xl shadow-black/15", className)}
      style={{ width, background: BEE.surface, color: BEE.text }}
      initial={false}
      animate={{ borderRadius: open ? "30px 30px 34px 34px" : "30px" }}
      transition={{ duration: 0.36 }}
    >
      <div className="flex h-[60px] items-center gap-3 pr-5 pl-4">
        <BeeLogo size={34} glow={false} />
        <span className="min-w-0 flex-1 truncate text-[17px] font-medium">
          {status}
        </span>
        <Waveform live={listening} />
      </div>
      <m.div
        initial={false}
        animate={
          open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }
        }
        transition={
          open
            ? {
                ...BEE_SPRING,
                delay: openDelay,
                opacity: { duration: DUR.base, delay: openDelay },
              }
            : { duration: DUR.fast, ease: EASE.in }
        }
      >
        <div className="px-6 pt-1 pb-6">{children}</div>
      </m.div>
    </m.div>
  );
}

/** One tip in the answer panel: Bee's 17px medium line, scaled for a slide. */
export function BeeTip({
  children,
  shown,
  delay = 0,
}: {
  children: ReactNode;
  shown: boolean;
  delay?: number;
}) {
  return (
    <m.p
      className="m-0 text-[21px] leading-snug font-medium text-pretty"
      initial={{ opacity: 0, y: 12 }}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={shown ? { ...BEE_SPRING, delay } : { duration: DUR.fast }}
    >
      {children}
    </m.p>
  );
}
