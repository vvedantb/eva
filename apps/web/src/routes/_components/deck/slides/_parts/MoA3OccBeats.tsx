import { IconPencil } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  BRAND,
  BRAND_GRADIENT,
  CountRoll,
  DUR,
  EASE,
  LEAVE,
  STAGGER,
  cueTransition,
} from "../../_components/motion";

/**
 * The first two beats of the database slide (c08): where the retries came
 * from, and why — two writers landing on the same row.
 */

/** Retry counts from three days of live traffic, by where they came from. */
const SOURCES: readonly { label: string; value: number }[] = [
  { label: "Presence heartbeats", value: 30 },
  { label: "Streaming touches", value: 24 },
  { label: "Lease renewals", value: 18 },
  { label: "Stall watchdog", value: 17 },
];

const MAX_BAR = 540;
const PEAK = 30;
const LABEL_W = 230;
const ROW_GAP = 24;
/** Label, bar and figure, so the chart can sit centred on the stage. */
const CHART_W = LABEL_W + ROW_GAP + MAX_BAR + ROW_GAP + 40;
const HEAD_GLOW =
  "radial-gradient(circle, rgba(255,255,255,0.95) 0 14%, rgba(59,125,216,0.5) 32%, transparent 70%)";

const BAR_RUN = 1;
/** Faint guides at a third, two thirds and the peak, so the bars read as measured. */
const GUIDES = [1 / 3, 2 / 3, 1];

export function MoA3CollisionChart({ filled }: { filled: boolean }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative flex flex-col gap-6" style={{ width: CHART_W }}>
        <div
          aria-hidden
          className="absolute -inset-y-4"
          style={{ left: LABEL_W + ROW_GAP, width: MAX_BAR }}
        >
          {GUIDES.map((at) => (
            <m.span
              key={at}
              className="absolute inset-y-0 w-px origin-top bg-white/[0.06]"
              style={{ left: at * MAX_BAR }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: filled ? 1 : 0 }}
              transition={cueTransition(filled, 0.1 + at * 0.2, {
                duration: DUR.slow,
                ease: EASE.expo,
              })}
            />
          ))}
        </div>
        {SOURCES.map((source, index) => {
          const width = (MAX_BAR * source.value) / PEAK;
          const delay = 0.25 + index * STAGGER.item;
          const run = cueTransition(filled, delay, {
            duration: BAR_RUN,
            ease: EASE.expo,
          });
          return (
            <div key={source.label} className="flex items-center gap-6">
              <div
                className="shrink-0 text-right text-sm text-white/55"
                style={{ width: LABEL_W }}
              >
                {source.label}
              </div>

              <div
                className="relative h-7 shrink-0 rounded-[8px] bg-white/[0.07]"
                style={{ width }}
              >
                <m.div
                  className="h-full origin-left rounded-[8px]"
                  style={{ background: BRAND_GRADIENT }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: filled ? 1 : 0 }}
                  transition={run}
                />
                {/* A lit head rides the fill out to its value. */}
                <m.span
                  aria-hidden
                  className="absolute top-1/2 left-0 -mt-4 -ml-4 size-8 rounded-full"
                  style={{ background: HEAD_GLOW }}
                  initial={{ x: 0, opacity: 0 }}
                  animate={
                    filled
                      ? { x: width, opacity: [0, 1, 1, 0] }
                      : { x: 0, opacity: 0 }
                  }
                  transition={
                    filled
                      ? {
                          x: run,
                          opacity: {
                            duration: BAR_RUN + 0.2,
                            times: [0, 0.1, 0.6, 1],
                            delay,
                          },
                        }
                      : { duration: 0 }
                  }
                />
              </div>

              <div className="text-lg text-white/70">
                <CountRoll
                  value={source.value}
                  step={1}
                  delay={delay + 0.15}
                  duration={1.1}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** When the two writers reach the row and collide. */
const IMPACT = 1.05;

function Writer({
  label,
  active,
  travel,
}: {
  label: string;
  active: boolean;
  travel: number;
}) {
  return (
    <m.div
      className="flex h-[74px] w-[200px] items-center justify-center gap-2.5 rounded-[16px] bg-white/[0.06] text-base text-white/75"
      initial={{ x: 0, opacity: 0 }}
      // In, a hard stop against the row, and a small recoil: two writes, one row.
      animate={
        active
          ? { x: [0, travel, travel * 0.82], opacity: 1 }
          : { x: 0, opacity: 0 }
      }
      transition={
        active
          ? {
              x: {
                duration: IMPACT + 0.45,
                times: [0, (IMPACT - 0.3) / (IMPACT + 0.45), 1],
                ease: [EASE.in, EASE.out],
                delay: 0.3,
              },
              opacity: { duration: DUR.base, delay: 0.3 },
            }
          : LEAVE
      }
    >
      <IconPencil
        size={18}
        stroke={1.6}
        className="text-white/45"
        aria-hidden
      />
      {label}
    </m.div>
  );
}

export function MoA3CollisionCause({ active }: { active: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-28">
      <Writer label="One writer" active={active} travel={64} />

      <div className="relative">
        {/* The shock of the collision leaves the row once. */}
        <m.span
          aria-hidden
          className="absolute inset-0 rounded-[20px]"
          style={{ border: `1.5px solid ${BRAND.blue}` }}
          initial={{ opacity: 0, scale: 1 }}
          animate={
            active
              ? { opacity: [0, 0.9, 0], scale: [1, 1, 1.28] }
              : { opacity: 0, scale: 1 }
          }
          transition={
            active
              ? {
                  duration: 0.9,
                  times: [0, 0.05, 1],
                  ease: EASE.out,
                  delay: IMPACT,
                }
              : { duration: 0 }
          }
        />
        <m.div
          className="flex h-[96px] w-[250px] items-center justify-center rounded-[20px] text-lg font-medium text-white"
          style={{ background: BRAND_GRADIENT }}
          animate={
            active
              ? { x: [0, -6, 6, -3, 0], scale: [1, 1.06, 1.02, 1.01, 1] }
              : { x: 0, scale: 1 }
          }
          transition={
            active
              ? { duration: 0.5, times: [0, 0.2, 0.45, 0.7, 1], delay: IMPACT }
              : { duration: DUR.fast }
          }
        >
          The same row
        </m.div>
      </div>

      <Writer label="Another writer" active={active} travel={-64} />
    </div>
  );
}
