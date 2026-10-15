import { m } from "motion/react";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  LEAVE,
  useMotionCue,
} from "../../_components/motion";

/** Every scene starts once its card has landed. */
const LEAD = 0.45;

function grow(on: boolean, delay: number, duration = DUR.slow) {
  return on ? { duration, ease: EASE.expo, delay } : LEAVE;
}

/** Quick task: one job runs from start to finish. */
function OneJob({ on, delay }: { on: boolean; delay: number }) {
  return (
    <div className="flex w-full items-center gap-3">
      <m.span
        className="flex size-4 items-center justify-center rounded-full"
        style={{ border: `1.5px solid ${BRAND.blue}` }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={grow(on, delay)}
      >
        <m.span
          className="size-1.5 rounded-full"
          style={{ background: BRAND.blue }}
          initial={{ scale: 0 }}
          animate={{ scale: on ? 1 : 0 }}
          transition={grow(on, delay + 1.1, DUR.base)}
        />
      </m.span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <m.div
          className="h-full origin-left rounded-full"
          style={{ background: BRAND_GRADIENT }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: on ? 1 : 0 }}
          transition={
            on ? { duration: 1.1, ease: EASE.inOut, delay: delay + 0.1 } : LEAVE
          }
        />
      </div>
    </div>
  );
}

/** Session: a conversation that keeps going, turn after turn. */
const TURNS: readonly { width: number; mine: boolean }[] = [
  { width: 150, mine: true },
  { width: 190, mine: false },
  { width: 110, mine: true },
];

function Conversation({ on, delay }: { on: boolean; delay: number }) {
  return (
    <div className="flex w-full flex-col gap-2">
      {TURNS.map((turn, index) => (
        <m.span
          key={index}
          className={
            turn.mine
              ? "h-3 self-end rounded-full"
              : "h-3 self-start rounded-full"
          }
          style={{
            width: turn.width,
            originX: turn.mine ? 1 : 0,
            background: turn.mine
              ? `${BRAND.purple}5c`
              : "rgba(255,255,255,0.1)",
          }}
          initial={{ opacity: 0, scale: 0.6, y: 6 }}
          animate={
            on
              ? { opacity: 1, scale: 1, y: 0 }
              : { opacity: 0, scale: 0.6, y: 6 }
          }
          transition={grow(on, delay + index * 0.28)}
        />
      ))}
    </div>
  );
}

/** Project: several jobs in order, each starting where the last one ends. */
const JOBS: readonly { start: number; span: number }[] = [
  { start: 0, span: 0.36 },
  { start: 0.3, span: 0.4 },
  { start: 0.62, span: 0.38 },
];
const TRACK = 314;

function Roadmap({ on, delay }: { on: boolean; delay: number }) {
  return (
    <div className="relative flex w-full flex-col gap-2.5">
      {JOBS.map((job, index) => (
        <div key={index} className="relative h-3 rounded-full bg-white/[0.04]">
          <m.span
            className="absolute inset-y-0 origin-left rounded-full"
            style={{
              left: job.start * TRACK,
              width: job.span * TRACK,
              background: BRAND_GRADIENT,
              opacity: 0.85 - index * 0.15,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: on ? 1 : 0 }}
            transition={
              on
                ? {
                    duration: 0.7,
                    ease: EASE.inOut,
                    delay: delay + index * 0.45,
                  }
                : LEAVE
            }
          />
        </div>
      ))}
    </div>
  );
}

/** A small wordless picture of each size of ask, played as its card lands. */
export function MoF1WayScene({ kind, step }: { kind: number; step: number }) {
  const { on, delay } = useMotionCue(step, LEAD);
  if (kind === 0) return <OneJob on={on} delay={delay} />;
  if (kind === 1) return <Conversation on={on} delay={delay} />;
  return <Roadmap on={on} delay={delay} />;
}
