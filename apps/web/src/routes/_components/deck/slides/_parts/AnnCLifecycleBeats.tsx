import { IconCamera, IconTrash } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  BRAND,
  BRAND_GRADIENT,
  DUR,
  EASE,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { AnnBCountDown } from "./AnnBCountDown";

/**
 * The three beats of the workspace lifecycle on the running-costs slide: the
 * one snapshot kept, the 48-hour grace and the weekly sweep. Each takes `live`
 * from its own build step.
 */

/** Every beat's visual shares one box, so the labels sit on one line. */
const VISUAL_H = 160;

/** Front to back: the kept snapshot, then the two older ones. */
const SNAPSHOT_TONES = ["#302b3b", "#26222f", "#1e1b26"];

/** A snapshot drawn as a tiny workspace window: title bar, then a few lines. */
function SnapshotFace({ kept }: { kept: boolean }) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex gap-1">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-1.5 rounded-full bg-white/20" />
        ))}
      </div>
      <div className="flex flex-1 items-center justify-center">
        {kept ? (
          <IconCamera
            size={38}
            stroke={1.4}
            className="text-white/80"
            aria-hidden
          />
        ) : (
          <div className="flex w-20 flex-col gap-1.5">
            <span className="h-1.5 rounded-full bg-white/15" />
            <span className="h-1.5 w-2/3 rounded-full bg-white/10" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Three snapshots slide in; the two older ones peel away and one is kept. */
export function SnapshotStack({ live }: { live: boolean }) {
  return (
    <div className="relative w-[216px]" style={{ height: VISUAL_H }}>
      {[2, 1, 0].map((layer) => {
        const kept = layer === 0;
        const arrive = 0.05 + (2 - layer) * 0.12;
        return (
          <m.div
            key={layer}
            // Opaque tones, darker further back, so the stack reads as paper
            // on paper rather than three washes bleeding into each other.
            className="absolute h-[112px] w-[168px] rounded-[16px]"
            // Older snapshots peek out up and to the left, so the kept one
            // sits centred over its station.
            style={{
              left: 24 - layer * 20,
              top: 36 - layer * 14,
              background: SNAPSHOT_TONES[layer],
            }}
            initial={{ opacity: 0, x: 36 }}
            animate={
              !live
                ? { opacity: kept ? 1 : 0, x: 0, y: 0, rotate: 0 }
                : kept
                  ? {
                      opacity: 1,
                      x: 0,
                      y: 0,
                      rotate: 0,
                      scale: [1, 1, 1.04, 1],
                    }
                  : {
                      opacity: [0, 1, 1, 0],
                      x: [36, 0, 0, -26],
                      y: [0, 0, 0, -18],
                      rotate: [0, 0, 0, -8],
                    }
            }
            transition={
              live
                ? {
                    duration: kept ? 1.4 : 1.5,
                    times: kept ? [0, 0.6, 0.8, 1] : [0, 0.35, 0.6, 1],
                    ease: [EASE.expo, "linear", EASE.inOut],
                    delay: arrive,
                  }
                : { duration: DUR.fast }
            }
          >
            {kept ? (
              <Sheen step={1} delay={1.1} className="h-full rounded-[16px]">
                <SnapshotFace kept />
              </Sheen>
            ) : (
              <SnapshotFace kept={false} />
            )}
            {/* The kept one is outlined in brand once its siblings have gone. */}
            {kept ? (
              <m.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[16px]"
                style={{ boxShadow: `inset 0 0 0 1.5px ${BRAND.blue}aa` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: live ? 1 : 0 }}
                transition={cueTransition(live, 1, {
                  duration: DUR.slow,
                  ease: EASE.out,
                })}
              />
            ) : null}
          </m.div>
        );
      })}
    </div>
  );
}

const GRACE_W = 214;
const GRACE_RUN = 1.7;
const GRACE_LEAD = 0.3;

/** The grace period: hours falling to zero over a bar that drains with them. */
export function GraceBar({ live }: { live: boolean }) {
  const run = cueTransition(live, GRACE_LEAD, {
    duration: GRACE_RUN,
    ease: EASE.inOut,
  });

  return (
    <div
      className="flex w-[260px] flex-col justify-center"
      style={{ height: VISUAL_H }}
    >
      <div className="text-center text-7xl leading-none font-semibold tracking-[-0.02em] text-white">
        <AnnBCountDown
          from={48}
          to={0}
          step={2}
          delay={GRACE_LEAD}
          duration={GRACE_RUN}
        />
        <m.span
          className="ml-1 text-4xl text-white/50"
          animate={{ opacity: live ? 1 : 0 }}
          transition={cueTransition(live, 0.2, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        >
          h
        </m.span>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div className="relative h-3" style={{ width: GRACE_W }}>
          <div className="absolute inset-0 overflow-hidden rounded-full bg-white/10">
            <m.div
              className="h-full origin-left rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: live ? 0 : 1 }}
              transition={run}
            />
          </div>
          {/* A lit end cap rides the draining edge back to zero. */}
          <m.span
            aria-hidden
            className="absolute top-1/2 -mt-[11px] -ml-[11px] size-[22px] rounded-full"
            style={{
              background: `radial-gradient(circle, #fff 0 20%, ${BRAND.blue}88 38%, transparent 70%)`,
            }}
            initial={{ x: GRACE_W, opacity: 0 }}
            animate={
              live
                ? { x: 0, opacity: [0, 1, 1, 0] }
                : { x: GRACE_W, opacity: 0 }
            }
            transition={
              live
                ? {
                    x: run,
                    opacity: {
                      duration: GRACE_RUN,
                      times: [0, 0.1, 0.85, 1],
                      delay: GRACE_LEAD,
                    },
                  }
                : { duration: 0 }
            }
          />
        </div>
        {/* Lands as the bar runs out: at zero the workspace is deleted. */}
        <m.span
          className="text-white/75"
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={
            live
              ? { opacity: 1, scale: 1, rotate: [0, -14, 10, -5, 0] }
              : { opacity: 0, scale: 0.6, rotate: 0 }
          }
          transition={
            live
              ? {
                  opacity: {
                    duration: DUR.base,
                    delay: GRACE_LEAD + GRACE_RUN - 0.2,
                  },
                  scale: {
                    duration: DUR.slow,
                    ease: EASE.expo,
                    delay: GRACE_LEAD + GRACE_RUN - 0.2,
                  },
                  rotate: {
                    duration: 0.6,
                    times: [0, 0.25, 0.5, 0.75, 1],
                    delay: GRACE_LEAD + GRACE_RUN,
                  },
                }
              : { duration: DUR.fast }
          }
        >
          <IconTrash size={26} stroke={1.6} aria-hidden />
        </m.span>
      </div>
    </div>
  );
}
