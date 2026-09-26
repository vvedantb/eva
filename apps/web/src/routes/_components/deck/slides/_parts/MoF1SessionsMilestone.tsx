import { m } from "motion/react";
import { BRAND, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, LEAVE, MaskedText } from "../../_components/motion";
import { CARD_W, LINE_Y } from "./sessionsTimelineLayout";
import type { Placed } from "./sessionsTimelineLayout";

/** Seconds from the step to the lit axis starting to run. */
export const LEAD = 0.15;

export interface Run {
  from: number;
  to: number;
  duration: number;
}

export function MoF1Milestone({ item, run }: { item: Placed; run: Run }) {
  const active = useDeckStep() >= item.step;
  const stem = item.stem;
  const at = LEAD + ((item.x - run.from) / (run.to - run.from)) * run.duration;
  const enter = (delay: number, duration = DUR.slow) =>
    active ? { duration, ease: EASE.expo, delay: at + delay } : LEAVE;

  return (
    <div className="absolute" style={{ left: item.x, top: LINE_Y }}>
      <m.div
        aria-hidden
        className="absolute w-px bg-white/15"
        style={{
          height: stem,
          top: item.above ? -stem : 0,
          originY: item.above ? 1 : 0,
        }}
        initial={{ scaleY: 0 }}
        animate={{ scaleY: active ? 1 : 0 }}
        transition={enter(0.05)}
      />

      {/* One ring as the head passes, then the dot holds. */}
      <m.span
        aria-hidden
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: `1.5px solid ${BRAND.blue}` }}
        initial={{ opacity: 0, scale: 1 }}
        animate={
          active ? { opacity: [0, 0.7, 0], scale: [1, 3.2] } : { opacity: 0 }
        }
        transition={
          active ? { duration: 0.9, ease: EASE.out, delay: at } : LEAVE
        }
      />
      <m.div
        aria-hidden
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_18px_rgba(139,63,184,0.6)]"
        style={{
          background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
        }}
        initial={{ scale: 0 }}
        animate={{ scale: active ? 1 : 0 }}
        transition={enter(0, DUR.base)}
      />

      <div
        className="absolute -translate-x-1/2 text-center"
        style={
          item.above
            ? { width: CARD_W, left: 0, bottom: stem }
            : { width: CARD_W, left: 0, top: stem }
        }
      >
        <MaskedText
          step={item.step}
          delay={at + 0.12}
          stagger={0.04}
          duration={DUR.slow}
          className="block text-sm leading-snug font-medium text-balance text-white/90"
        >
          {item.label}
        </MaskedText>
        <m.div
          className="mt-1 text-xs text-white/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: active ? 1 : 0 }}
          transition={enter(0.3, DUR.base)}
        >
          {item.date}
        </m.div>
      </div>
    </div>
  );
}
