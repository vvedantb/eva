import { AnimatePresence, m } from "motion/react";
import { IconCircleCheckFilled } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  EASE,
  Pulse,
  SETTLE,
  Sheen,
  cueTransition,
} from "../../_components/motion";

interface Span {
  offset: number;
  width: number;
}

export interface MoF2Bar {
  label: string;
  month: Span;
  week: Span;
  done: number;
}

export const MOF2_TRACK = 860;
/** Label column plus the gap before the track. */
export const MOF2_LABEL = 170;

const TICKS: Record<"month" | "week", readonly string[]> = {
  month: ["Jun", "Jul", "Aug", "Sep"],
  week: ["W1", "W2", "W3", "W4", "W5", "W6"],
};

const TODAY = { month: 340, week: 626 };

const ROWS_AT = 0.55;
const ROW_GAP = 0.09;

const LEAVE_UP = { duration: DUR.fast, ease: EASE.in };

function useZoom(): "month" | "week" {
  return useDeckStep() >= 2 ? "week" : "month";
}

function Tick({ index }: { index: number }) {
  const zoom = useZoom();
  const ticks = TICKS[zoom];
  const label = ticks[index];
  const x = (index * MOF2_TRACK) / ticks.length;

  return (
    <m.div
      className="absolute top-0 bottom-0 left-0"
      initial={{ x, opacity: 0 }}
      animate={{ x, opacity: label ? 1 : 0 }}
      transition={{
        x: { duration: DUR.hero, ease: EASE.expo },
        opacity: { duration: DUR.base, delay: 0.3 + index * 0.05 },
      }}
    >
      <span className="absolute top-6 bottom-0 left-0 w-px bg-white/[0.05]" />
      <span className="absolute top-0 left-0 block h-4 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={label ?? "none"}
            className="block text-[11px] whitespace-nowrap text-white/40 tabular-nums"
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-110%", transition: LEAVE_UP }}
            transition={{
              duration: DUR.slow,
              ease: EASE.expo,
              delay: 0.1 + index * 0.04,
            }}
          >
            {label}
          </m.span>
        </AnimatePresence>
      </span>
    </m.div>
  );
}

/** The axis and gridlines, laid over the track column from the tick row down. */
export function MoF2Axis() {
  return (
    <div
      className="pointer-events-none absolute top-5 bottom-5"
      style={{ left: 24 + MOF2_LABEL, width: MOF2_TRACK }}
    >
      {TICKS.week.map((tick, index) => (
        <Tick key={tick} index={index} />
      ))}
    </div>
  );
}

/** A brand hairline at today's date, with a live dot on top. Rides the zoom. */
export function MoF2Today() {
  const zoom = useZoom();
  return (
    <div
      className="pointer-events-none absolute top-11 bottom-4"
      style={{ left: 24 + MOF2_LABEL, width: MOF2_TRACK }}
    >
      <m.div
        className="absolute top-0 bottom-0 left-0 flex w-px flex-col items-center"
        initial={{ x: TODAY.month, opacity: 0, scaleY: 0 }}
        animate={{ x: TODAY[zoom], opacity: 1, scaleY: 1 }}
        style={{ originY: 0 }}
        transition={{
          x: { duration: DUR.hero, ease: EASE.expo },
          scaleY: { duration: 1.1, ease: EASE.expo, delay: 1.1 },
          opacity: { duration: DUR.base, delay: 1.1 },
        }}
      >
        <span
          className="h-full w-px"
          style={{
            background: `linear-gradient(180deg, ${BRAND.blue}, transparent)`,
          }}
        />
      </m.div>
      <m.div
        className="absolute -top-1 left-0 -ml-[4px]"
        initial={{ x: TODAY.month, opacity: 0 }}
        animate={{ x: TODAY[zoom], opacity: 1 }}
        transition={{
          x: { duration: DUR.hero, ease: EASE.expo },
          opacity: { duration: DUR.base, delay: 1.2 },
        }}
      >
        <Pulse color={BRAND.blue} size={9} delay={1.3} />
      </m.div>
    </div>
  );
}

export function MoF2RoadmapRow({
  bar,
  index,
}: {
  bar: MoF2Bar;
  index: number;
}) {
  const step = useDeckStep();
  const filled = step >= 1;
  const place = step >= 2 ? bar.week : bar.month;
  const land = ROWS_AT + index * ROW_GAP;
  const fillAt = 0.1 + index * 0.14;
  const complete = bar.done >= 1;

  return (
    <div className="flex h-11 items-center" style={{ gap: 20 }}>
      <m.span
        className="flex w-[150px] shrink-0 items-center gap-2 text-[13px]"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: DUR.slow, ease: EASE.out, delay: land }}
      >
        <span
          className={cn(
            "truncate transition-colors duration-500",
            filled ? "text-white/80" : "text-white/55",
          )}
        >
          {bar.label}
        </span>
        {complete ? (
          <m.span
            className="text-emerald-300"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={
              filled ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }
            }
            transition={cueTransition(filled, 1, SETTLE)}
          >
            <IconCircleCheckFilled size={14} aria-hidden />
          </m.span>
        ) : null}
      </m.span>
      <div
        className="relative h-9 overflow-hidden rounded-[12px] bg-white/[0.035]"
        style={{ width: MOF2_TRACK }}
      >
        <m.div
          className="absolute inset-0 origin-left"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            duration: 1.1,
            ease: EASE.expo,
            delay: land + 0.1,
            opacity: { duration: DUR.base, delay: land + 0.1 },
          }}
        >
          <m.div
            layout
            className="absolute top-1.5 h-6 overflow-hidden rounded-[8px] bg-white/[0.08] ring-1 ring-white/[0.05] ring-inset"
            style={{ left: place.offset, width: place.width }}
            transition={{ duration: DUR.hero, ease: EASE.expo }}
          >
            <m.div
              className="h-full origin-left rounded-[8px]"
              style={{
                background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
              }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: filled ? bar.done : 0 }}
              transition={
                filled
                  ? { duration: 1.1, ease: EASE.expo, delay: fillAt }
                  : { duration: DUR.fast }
              }
            >
              <Sheen
                step={1}
                delay={fillAt + 0.55}
                duration={0.9}
                className="h-full rounded-[8px]"
              >
                <span className="block h-6" />
              </Sheen>
            </m.div>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}
