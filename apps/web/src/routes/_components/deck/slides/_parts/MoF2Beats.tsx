import type { ReactNode } from "react";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";
import { m } from "motion/react";
import { CountUp } from "../../_components/CountUp";
import {
  DUR,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";

const CARD_CLASS =
  "flex h-full w-full flex-col justify-between rounded-[28px] bg-white/[0.05] p-8 ring-1 ring-white/[0.07] ring-inset";

export const MOF2_BEAT = { width: 344, height: 340, gap: 28 };

/**
 * One reliability card. A faint dashed slot waits for it, so the track of three
 * is visible from the first frame; on its step the card rises into the slot
 * and a band of light crosses it as it settles.
 */
export function MoF2Beat({
  shown,
  step,
  delay = 0,
  children,
}: {
  shown: boolean;
  /** Seconds before the card rises, once shown. */
  delay?: number;
  /** The step the card lands on, which cues its sheen. */
  step: number;
  children: ReactNode;
}) {
  return (
    <div
      className="relative"
      style={{ width: MOF2_BEAT.width, height: MOF2_BEAT.height }}
    >
      <m.div
        aria-hidden
        className="absolute inset-0 rounded-[28px] border border-dashed border-white/10"
        animate={{ opacity: shown ? 0 : 1 }}
        transition={{ duration: DUR.base, ease: EASE.out }}
      />
      <m.div
        className="h-full"
        initial={{ opacity: 0, y: 26, scale: 0.94 }}
        animate={
          shown
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 26, scale: 0.94 }
        }
        transition={cueTransition(shown, delay, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <Sheen step={step} delay={0.35} className="h-full rounded-[28px]">
          <div className={CARD_CLASS}>{children}</div>
        </Sheen>
      </m.div>
    </div>
  );
}

/** Step 0: a turn that hangs. The clock keeps counting and the bar never ends. */
export function MoF2Stuck() {
  return (
    <div className="flex h-full flex-col justify-between">
      <m.div
        aria-hidden
        className="w-fit"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
      >
        <IconLoader2 size={40} stroke={1.8} className="text-white/45" />
      </m.div>
      <div>
        <CountUp
          value={120}
          duration={11}
          suffix=" min"
          className="text-6xl leading-none font-semibold text-white/50 tabular-nums"
        />
        <div className="mt-4 text-base text-white/45">Working…</div>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <m.span
            aria-hidden
            className="block h-full w-1/3 rounded-full bg-white/20"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 2.4, ease: EASE.inOut, repeat: Infinity }}
          />
        </div>
      </div>
    </div>
  );
}

/** Step 1: the watchdog has closed it. */
export function MoF2Closed() {
  return (
    <div className="flex h-full flex-col justify-between">
      <m.span
        className="w-fit text-amber-300/80"
        initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.1 }}
      >
        <IconAlertTriangle size={40} stroke={1.6} aria-hidden />
      </m.span>
      <div>
        <div className="text-3xl leading-tight font-semibold text-balance text-white">
          <MaskedText delay={0.15}>Closed in minutes</MaskedText>
        </div>
        <m.span
          className="mt-5 inline-block rounded-full bg-white/[0.08] px-4 py-1.5 text-sm text-white/65"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.slow, ease: EASE.expo, delay: 0.5 }}
        >
          Partial reply kept
        </m.span>
      </div>
    </div>
  );
}
