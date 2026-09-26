import { m } from "motion/react";
import { DUR, EASE, LEAVE } from "../../_components/motion";

export const RADIUS = 185;
/** The visual box is 560 square; everything orbits its centre. */
const BOX = 560;
const C = BOX / 2;
/** The ring as a path, so one light can ride it with CSS `offset-path`. */
const RING = `M ${C - RADIUS} ${C} a ${RADIUS} ${RADIUS} 0 1 0 ${RADIUS * 2} 0 a ${RADIUS} ${RADIUS} 0 1 0 ${-RADIUS * 2} 0`;
/** Sparks leaving the laptop for the cloud: the hand-off, once. */
const SPARKS = [-34, -12, 10, 30];

export function Handoff({ lifted }: { lifted: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {SPARKS.map((x, index) => (
        <m.span
          key={x}
          aria-hidden
          className="absolute size-1.5 rounded-full bg-white"
          initial={{ opacity: 0, x, y: 80 }}
          animate={
            lifted
              ? { opacity: [0, 0.9, 0], x: x * 0.3, y: [80, 10] }
              : { opacity: 0, x, y: 80 }
          }
          transition={
            lifted
              ? { duration: 0.9, ease: EASE.out, delay: 0.05 + index * 0.07 }
              : LEAVE
          }
        />
      ))}
    </div>
  );
}

export function Orbit({ lifted }: { lifted: boolean }) {
  return (
    <svg
      aria-hidden
      width={BOX}
      height={BOX}
      className="absolute inset-0 m-auto overflow-visible"
      fill="none"
    >
      <m.path
        d={RING}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={
          lifted ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }
        }
        transition={
          lifted ? { duration: 1.6, ease: EASE.inOut, delay: 0.3 } : LEAVE
        }
      />
    </svg>
  );
}

/** One light circling the ring for as long as the work lives up there. */
export function Satellite({ lifted }: { lifted: boolean }) {
  return (
    <m.span
      aria-hidden
      className="absolute top-0 left-0 size-4 rounded-full"
      style={{
        offsetPath: `path("${RING}")`,
        offsetRotate: "0deg",
        background:
          "radial-gradient(circle closest-side, #fff 0 25%, rgba(140,170,255,0.5) 45%, transparent)",
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: lifted ? 1 : 0,
        offsetDistance: lifted ? ["0%", "100%"] : "0%",
      }}
      transition={{
        opacity: lifted ? { duration: DUR.slow, delay: 1.8 } : LEAVE,
        offsetDistance: lifted
          ? { duration: 14, ease: "linear", repeat: Infinity, delay: 1.8 }
          : { duration: 0 },
      }}
    />
  );
}
