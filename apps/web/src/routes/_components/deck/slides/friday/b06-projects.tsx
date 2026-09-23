import { AnimatePresence, m } from "motion/react";
import type { Transition } from "motion/react";
import { cn } from "@eva/ui";
import {
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriWindow } from "../_parts/FriMock";

interface Bar {
  label: string;
  /** Left edge and length in track pixels, at each zoom level. */
  month: { offset: number; width: number };
  week: { offset: number; width: number };
  /** How far along the work is, 0 to 1. */
  done: number;
}

/** Four jobs, top to bottom, in the order they run. */
const BARS: readonly Bar[] = [
  {
    label: "Referral portal",
    month: { offset: 0, width: 300 },
    week: { offset: 0, width: 540 },
    done: 1,
  },
  {
    label: "Exports",
    month: { offset: 70, width: 330 },
    week: { offset: 130, width: 600 },
    done: 0.72,
  },
  {
    label: "Admin pages",
    month: { offset: 190, width: 360 },
    week: { offset: 350, width: 650 },
    done: 0.45,
  },
  {
    label: "Decline emails",
    month: { offset: 330, width: 300 },
    week: { offset: 610, width: 540 },
    done: 0.18,
  },
];

const ZOOMS: readonly string[] = ["Quarter", "Month", "Week"];

const TICKS: Record<"month" | "week", readonly string[]> = {
  month: ["Jun", "Jul", "Aug", "Sep"],
  week: ["W1", "W2", "W3", "W4", "W5", "W6"],
};

const TRACK = 780;
const SETTLE: Transition = { type: "spring", bounce: 0, duration: 0.6 };

function ZoomSwitch() {
  const active = useDeckStep() >= 2 ? "Week" : "Month";

  return (
    <div className="flex items-center gap-1 rounded-[12px] bg-white/[0.05] p-1">
      {ZOOMS.map((zoom) => (
        <span key={zoom} className="relative px-2.5 py-1">
          {zoom === active ? (
            <m.span
              layoutId="fri-zoom-active"
              className="absolute inset-0 rounded-[8px] bg-white/[0.14]"
              transition={SETTLE}
            />
          ) : null}
          <span
            className={cn(
              "relative text-[11px]",
              zoom === active ? "text-white" : "text-white/40",
            )}
          >
            {zoom}
          </span>
        </span>
      ))}
    </div>
  );
}

function RoadmapRow({ bar, index }: { bar: Bar; index: number }) {
  const step = useDeckStep();
  const filled = step >= 1;
  const place = step >= 2 ? bar.week : bar.month;

  return (
    <div className="flex items-center gap-5">
      <span className="w-[150px] shrink-0 truncate text-[13px] text-white/55">
        {bar.label}
      </span>
      <div
        className="relative h-9 overflow-hidden rounded-[12px] bg-white/[0.04]"
        style={{ width: TRACK }}
      >
        <m.div
          layout
          className="absolute top-1.5 h-6 overflow-hidden rounded-[8px] bg-white/[0.07]"
          style={{ left: place.offset, width: place.width }}
          transition={SETTLE}
        >
          <m.div
            className="h-full origin-left rounded-[8px] bg-gradient-to-r from-[#8B3FB8] to-[#3B7DD8]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: filled ? bar.done : 0 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.9,
              delay: filled ? index * 0.1 : 0,
            }}
          />
        </m.div>
      </div>
    </div>
  );
}

function TickRow() {
  const zoom = useDeckStep() >= 2 ? "week" : "month";

  return (
    <div className="flex items-center gap-5">
      <span className="w-[150px] shrink-0" />
      <div className="relative h-4" style={{ width: TRACK }}>
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={zoom}
            className="flex"
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {TICKS[zoom].map((tick) => (
              <span
                key={tick}
                className="text-[11px] text-white/35 tabular-nums"
                style={{ width: TRACK / TICKS[zoom].length }}
              >
                {tick}
              </span>
            ))}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function FridayProjects() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Projects</Kicker>
        <Title size="md">Several jobs, in order.</Title>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <FriWindow
          label="Referral portal"
          className="h-[320px] w-full"
          bodyClassName="flex flex-col gap-3 px-6 py-5"
          trailing={<ZoomSwitch />}
        >
          <TickRow />
          {BARS.map((bar, index) => (
            <RoadmapRow key={bar.label} bar={bar} index={index} />
          ))}
        </FriWindow>
      </Reveal>

      <Footnote>
        The projects timeline became a roadmap with completion bars, zoom
        levels, a jump to today and drag-to-pan, 17 June 2026.
      </Footnote>
    </Shell>
  );
}
