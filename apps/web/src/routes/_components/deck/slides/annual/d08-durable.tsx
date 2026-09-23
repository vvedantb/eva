import { IconCheck, IconPlugOff } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** The five checkpoints a turn passes through, evenly spaced along the track. */
const CHECKPOINTS: readonly string[] = [
  "Start",
  "Plan",
  "Build",
  "Check",
  "Finish",
];

const TRACK_W = 880;
const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;
/** Where the turn is interrupted, as a fraction of the track. */
const BREAK_AT = 0.62;

function Checkpoint({
  name,
  index,
  durable,
}: {
  name: string;
  index: number;
  durable: boolean;
}) {
  // Everything up to Build sits before the break, so those three tick either way.
  const reached = durable || index <= 2;
  // The fill crosses each checkpoint in order, so the tick waits its turn.
  const delay = durable ? 0.35 + index * 0.5 : 0.25 + index * 0.35;

  return (
    <div
      className="absolute top-0 flex w-24 -translate-x-1/2 flex-col items-center"
      style={{ left: (TRACK_W * index) / (CHECKPOINTS.length - 1) }}
    >
      <m.span
        className="flex size-8 items-center justify-center rounded-full bg-white/12 text-white"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT, delay: index * 0.07 }}
      >
        <m.span
          className="flex size-8 items-center justify-center rounded-full"
          style={{ background: GRADIENT }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: reached ? 1 : 0,
            opacity: reached ? 1 : 0,
          }}
          transition={{
            type: "spring",
            bounce: 0.3,
            duration: 0.45,
            delay: reached ? delay : 0,
          }}
        >
          <IconCheck size={16} stroke={3} aria-hidden />
        </m.span>
      </m.span>
      <span className="mt-3 text-sm text-white/55">{name}</span>
    </div>
  );
}

function Track({ durable }: { durable: boolean }) {
  return (
    <div className="relative mx-auto" style={{ width: TRACK_W }}>
      <div className="absolute top-[13px] right-0 left-0 h-1.5 rounded-full bg-white/12" />

      <m.div
        // Remounting on the boundary replays the whole run, so the room watches
        // the same turn succeed rather than comparing two static pictures.
        key={durable ? "durable" : "broken"}
        className="absolute top-[13px] left-0 h-1.5 origin-left rounded-full"
        style={{ background: GRADIENT, width: TRACK_W }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: durable ? [0, BREAK_AT, BREAK_AT, 1] : BREAK_AT }}
        transition={
          durable
            ? { duration: 2.4, times: [0, 0.4, 0.55, 1], ease: EASE_OUT }
            : { duration: 1.3, ease: EASE_OUT }
        }
      />

      <m.span
        key={durable ? "flash" : "stall"}
        aria-hidden
        className="absolute top-0 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400/20 text-amber-300"
        style={{ left: TRACK_W * BREAK_AT }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={
          durable
            ? { opacity: [0, 1, 0], scale: [0.6, 1, 0.8] }
            : { opacity: 1, scale: 1 }
        }
        transition={
          durable
            ? {
                duration: 1.4,
                times: [0, 0.35, 1],
                delay: 0.95,
                ease: EASE_OUT,
              }
            : { duration: 0.45, delay: 1.35, ease: EASE_OUT }
        }
      >
        <IconPlugOff size={16} stroke={2} />
      </m.span>

      {CHECKPOINTS.map((name, index) => (
        <Checkpoint key={name} name={name} index={index} durable={durable} />
      ))}
    </div>
  );
}

export function AnnualDurable() {
  const durable = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Reliability</Kicker>
        <Title size="md">Finishing what it starts.</Title>
      </Reveal>

      <div className="mt-28 h-[72px]">
        <Track durable={durable} />
      </div>

      <div className="relative mt-14 h-10 text-center">
        <m.p
          className="absolute inset-x-0 text-xl text-white/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: durable ? 0 : 1 }}
          transition={{
            duration: durable ? 0.25 : 0.4,
            ease: EASE_OUT,
            delay: durable ? 0 : 1.7,
          }}
        >
          Stuck on Working
        </m.p>
        <m.p
          className="absolute inset-x-0 text-xl text-white/85"
          initial={{ opacity: 0 }}
          animate={{ opacity: durable ? 1 : 0 }}
          transition={{
            duration: 0.4,
            ease: EASE_OUT,
            delay: durable ? 2.3 : 0,
          }}
        >
          Interrupted, then finished
        </m.p>
      </div>

      <Reveal step={2} className="mt-16 text-center">
        <p className="text-3xl text-white/85">
          Interrupted is no longer the same as <Accent>lost</Accent>.
        </p>
      </Reveal>

      <Footnote>
        One durable lifecycle for every turn, 19 August 2026; remaining gaps
        closed 23 August 2026.
      </Footnote>
    </Shell>
  );
}
