import { IconCheck, IconPlugOff } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  Pulse,
} from "../../_components/motion";

/**
 * The turn on the reliability slide (d08), drawn as a track through five
 * checkpoints: broken at the interruption on step 0, carried through on step 1.
 */

/** The five checkpoints a turn passes through, evenly spaced along the track. */
const CHECKPOINTS: readonly string[] = [
  "Start",
  "Plan",
  "Build",
  "Check",
  "Finish",
];

const TRACK_W = 880;
/** Where the turn is interrupted, as a fraction of the track. */
const BREAK_AT = 0.62;
/** Seconds for the broken run: straight to the break, then nothing. */
export const MOA3_BROKEN_RUN = 1.3;
/** The durable run: to the break, a held beat while it resumes, then on to the end. */
export const MOA3_DURABLE_RUN = 2.6;
const DURABLE_TIMES = [0, 0.4, 0.56, 1];
const HEAD_GLOW =
  "radial-gradient(circle, #fff 0 16%, rgba(59,125,216,0.55) 34%, transparent 70%)";

/** When the fill crosses checkpoint `index`, so its tick lands on time. */
function crossing(index: number, durable: boolean): number {
  const at = index / (CHECKPOINTS.length - 1);
  if (!durable) return (at / BREAK_AT) * MOA3_BROKEN_RUN * 0.55;
  if (at <= BREAK_AT)
    return (at / BREAK_AT) * DURABLE_TIMES[1] * MOA3_DURABLE_RUN;
  const resume = DURABLE_TIMES[2] * MOA3_DURABLE_RUN;
  return (
    resume + ((at - BREAK_AT) / (1 - BREAK_AT)) * (MOA3_DURABLE_RUN - resume)
  );
}

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
  const delay = crossing(index, durable);

  return (
    <div
      className="absolute top-0 flex w-24 -translate-x-1/2 flex-col items-center"
      style={{ left: (TRACK_W * index) / (CHECKPOINTS.length - 1) }}
    >
      <m.span
        className="relative flex size-8 items-center justify-center rounded-full bg-white/12 text-white"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          duration: DUR.slow,
          ease: EASE.expo,
          delay: index * 0.06,
        }}
      >
        {/* Remounted per run, so each run's crossing rings once. */}
        <m.span
          key={durable ? "durable" : "broken"}
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${BRAND.blue}` }}
          initial={{ scale: 1, opacity: 0 }}
          animate={reached ? { scale: [1, 2], opacity: [0.8, 0] } : {}}
          transition={{ duration: 0.8, ease: EASE.out, delay }}
        />
        <m.span
          className="flex size-8 items-center justify-center rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: reached ? 1 : 0,
            opacity: reached ? 1 : 0,
          }}
          transition={
            reached
              ? { duration: DUR.slow, ease: EASE.expo, delay }
              : { duration: DUR.fast }
          }
        >
          <IconCheck size={16} stroke={3} aria-hidden />
        </m.span>
      </m.span>
      <span className="mt-3 text-sm text-white/55">{name}</span>
    </div>
  );
}

export function MoA3DurableTrack({
  durable,
  closing,
}: {
  durable: boolean;
  closing: boolean;
}) {
  const run = durable
    ? { duration: MOA3_DURABLE_RUN, times: DURABLE_TIMES, ease: EASE.inOut }
    : { duration: MOA3_BROKEN_RUN, ease: EASE.expo };

  return (
    <div className="relative mx-auto" style={{ width: TRACK_W }}>
      <div className="absolute top-[13px] right-0 left-0 h-1.5 overflow-hidden rounded-full bg-white/12">
        <m.div
          // Remounting on the boundary replays the whole run, so the room watches
          // the same turn succeed rather than comparing two static pictures.
          key={durable ? "durable" : "broken"}
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: durable ? [0, BREAK_AT, BREAK_AT, 1] : BREAK_AT }}
          transition={run}
        />
        {/* On the closing line, one band of light runs the finished track. */}
        <m.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-40"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
          }}
          initial={{ x: -160 }}
          animate={{ x: closing ? TRACK_W : -160 }}
          transition={
            closing
              ? { duration: 1.4, ease: EASE.inOut, delay: 0.5 }
              : { duration: 0 }
          }
        />
      </div>

      {/* The lit head of the turn, riding the fill. */}
      <m.span
        key={durable ? "head-durable" : "head-broken"}
        aria-hidden
        className="absolute top-[16px] left-0 -mt-3.5 -ml-3.5 size-7 rounded-full"
        style={{ background: HEAD_GLOW }}
        initial={{ x: 0, opacity: 0 }}
        animate={{
          x: durable
            ? [0, TRACK_W * BREAK_AT, TRACK_W * BREAK_AT, TRACK_W]
            : TRACK_W * BREAK_AT,
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          x: run,
          opacity: {
            duration: (durable ? MOA3_DURABLE_RUN : MOA3_BROKEN_RUN) + 0.3,
            times: [0, 0.05, 0.85, 1],
          },
        }}
      />

      <m.span
        key={durable ? "flash" : "stall"}
        aria-hidden
        className="absolute top-0 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400/20 text-amber-300"
        style={{ left: TRACK_W * BREAK_AT }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={
          durable
            ? { opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.8] }
            : { opacity: 1, scale: 1 }
        }
        transition={
          durable
            ? {
                duration: 1.5,
                times: [0, 0.2, 0.65, 1],
                delay: DURABLE_TIMES[1] * MOA3_DURABLE_RUN - 0.15,
                ease: EASE.out,
              }
            : {
                duration: DUR.slow,
                delay: MOA3_BROKEN_RUN - 0.1,
                ease: EASE.expo,
              }
        }
      >
        {/* Stalled is a live state: it keeps signalling until something picks it up. */}
        {durable ? (
          <IconPlugOff size={16} stroke={2} />
        ) : (
          <Pulse
            delay={MOA3_BROKEN_RUN + 0.3}
            color="rgba(251,191,36,0.7)"
            rings={2}
            period={2.4}
            reach={2}
            className="rounded-full"
          >
            <IconPlugOff size={16} stroke={2} />
          </Pulse>
        )}
      </m.span>

      {CHECKPOINTS.map((name, index) => (
        <Checkpoint key={name} name={name} index={index} durable={durable} />
      ))}
    </div>
  );
}
