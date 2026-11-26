import { m } from "motion/react";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
  SETTLE,
} from "../../_components/motion";
import { MoA3AccentRoll } from "./MoA3AccentRoll";

/** The debugging slide's (a10) closing figures and its case pager. */

const BIG_NUMBER =
  "relative top-[0.09em] text-5xl font-semibold tracking-[-0.02em]";
const ENTER = { duration: DUR.hero, ease: EASE.expo };
const EXIT = { duration: DUR.base, ease: EASE.in };

const RESTARTS = 65;
const LAUNCHES = 146;
const RATIO_W = 440;

export function MoA3DebugClosing() {
  return (
    <m.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, transition: ENTER }}
      exit={{ opacity: 0, y: -10, transition: EXIT }}
    >
      <p className="text-center text-3xl leading-snug text-white/75">
        <span className={BIG_NUMBER}>
          <MoA3AccentRoll
            value={RESTARTS}
            step={3}
            duration={1.3}
            delay={0.3}
          />
        </span>{" "}
        <MaskedText delay={0.45}>restarts against</MaskedText>{" "}
        <span className={BIG_NUMBER}>
          <MoA3AccentRoll
            value={LAUNCHES}
            step={3}
            duration={1.3}
            delay={0.6}
          />
        </span>{" "}
        <MaskedText delay={0.75}>
          launches — found by searching live traffic.
        </MaskedText>
      </p>
      {/* The two figures as one bar: restarts filling their share of launches. */}
      <div
        aria-hidden
        className="relative mt-10 h-1.5 overflow-hidden rounded-full bg-white/10"
        style={{ width: RATIO_W }}
      >
        <m.div
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: RESTARTS / LAUNCHES }}
          transition={{ duration: 1.3, ease: EASE.expo, delay: 1.2 }}
        />
      </div>
    </m.div>
  );
}

/** Each case owns a slot; the pill glides between slots over the resting dots. */
const SLOT = 30;
const PILL = 24;

export function MoA3DebugPager({
  count,
  step,
  visible,
}: {
  count: number;
  step: number;
  visible: boolean;
}) {
  const at = Math.min(step, count - 1);
  return (
    <m.div
      className="relative mx-auto mt-6 h-1.5"
      style={{ width: SLOT * count }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="absolute top-0 h-1.5 w-2 -translate-x-1/2 rounded-full bg-white/[0.18]"
          style={{ left: index * SLOT + SLOT / 2 }}
        />
      ))}
      <m.span
        className="absolute top-0 h-1.5 rounded-full"
        style={{
          left: (SLOT - PILL) / 2,
          width: PILL,
          background: BRAND_GRADIENT,
        }}
        initial={false}
        animate={{ x: at * SLOT }}
        transition={SETTLE}
      />
    </m.div>
  );
}
