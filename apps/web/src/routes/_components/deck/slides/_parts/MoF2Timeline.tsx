import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  DrawPath,
  EASE,
  MaskedText,
  cueTransition,
} from "../../_components/motion";

const DAYS: readonly string[] = ["Today", "Yesterday"];

/** Pixel layout of the two entries, so the rail and the feed line land on the dots. */
const GROUP = 146;
const CARD_TOP = 30;
const CARD_H = 100;
const DOT_Y = CARD_TOP + 20;
const INDENT = 26;
export const MOF2_TIMELINE_DOT_Y = DOT_Y;

function Entry({ index }: { index: number }) {
  const shown = useDeckStep() >= 2;
  const at = 0.3 + index * 0.55;
  const top = index * GROUP;

  return (
    <>
      <div
        className="absolute h-5 text-sm font-medium text-white/85"
        style={{ top, left: INDENT }}
      >
        <MaskedText step={2} delay={at - 0.05} duration={0.7}>
          {DAYS[index]}
        </MaskedText>
      </div>
      <m.div
        className="absolute right-0 rounded-[14px] bg-white/[0.05] p-3.5 ring-1 ring-white/[0.06]"
        style={{ top: top + CARD_TOP, left: INDENT, height: CARD_H }}
        initial={{ opacity: 0, y: 18 }}
        animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
        transition={cueTransition(shown, at + 0.08, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <div className="text-xs text-white/55 tabular-nums">08:00</div>
        <div className="mt-2.5 space-y-2">
          {[100, 86, 92, 64].map((width, line) => (
            <m.span
              key={width}
              className="block h-1.5 origin-left rounded-full bg-white/[0.13]"
              style={{ width: `${width}%` }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: shown ? 1 : 0 }}
              transition={cueTransition(shown, at + 0.25 + line * 0.05, {
                duration: DUR.slow,
                ease: EASE.expo,
              })}
            />
          ))}
        </div>
      </m.div>
      <m.span
        aria-hidden
        className="absolute -ml-[5px] size-2.5 rounded-full ring-4 ring-[#0b0c11]"
        style={{ top: top + DOT_Y - 5, left: 4, backgroundColor: BRAND.blue }}
        initial={{ scale: 0 }}
        animate={{ scale: shown ? 1 : 0 }}
        transition={cueTransition(shown, at, {
          duration: DUR.base,
          ease: EASE.out,
        })}
      />
    </>
  );
}

/**
 * Each morning's summary drops onto a vertical feed: a rail draws from today
 * down to yesterday, and each entry lands beside its dot.
 */
export function MoF2Timeline() {
  return (
    <div className="relative h-[276px] w-[440px]">
      <div className="absolute" style={{ left: 3, top: DOT_Y }}>
        <DrawPath
          d={`M1 0 L1 ${GROUP}`}
          width={2}
          height={GROUP}
          step={2}
          delay={0.35}
          duration={0.6}
          strokeWidth={1.5}
          color="rgba(255,255,255,0.18)"
          dot
        />
      </div>
      {DAYS.map((day, index) => (
        <Entry key={day} index={index} />
      ))}
    </div>
  );
}
