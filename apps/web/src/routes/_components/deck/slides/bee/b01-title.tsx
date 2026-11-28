import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { BeeLogo } from "./_parts/BeeLogo";
import type { LogoState } from "./_parts/BeeLogo";

const LANDED = 1;
const SETTLED = 2;

const WAYPOINTS: readonly (readonly [number, number])[] = [
  [-760, 220],
  [-420, -60],
  [-40, -170],
  [320, 10],
  [180, 150],
  [-60, 40],
  [0, 0],
];
const SAMPLES = 60;

function catmullRom(a: number, b: number, c: number, d: number, t: number) {
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t)
  );
}

function pointAt(u: number): readonly [number, number] {
  const last = WAYPOINTS.length - 1;
  const at = Math.min(u * last, last - 1e-6);
  const i = Math.floor(at);
  const t = at - i;
  const p = (k: number) => WAYPOINTS[Math.max(0, Math.min(last, k))];
  return [
    catmullRom(p(i - 1)[0], p(i)[0], p(i + 1)[0], p(i + 2)[0], t),
    catmullRom(p(i - 1)[1], p(i)[1], p(i + 1)[1], p(i + 2)[1], t),
  ];
}

const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);

const FLIGHT = (() => {
  const x: number[] = [];
  const y: number[] = [];
  const rotate: number[] = [];
  const scale: number[] = [];
  const opacity: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = easeInOut(t);
    const [px, py] = pointAt(u);
    const [nx] = pointAt(Math.min(1, u + 0.01));
    x.push(Math.round(px * 10) / 10);
    y.push(Math.round(py * 10) / 10);
    rotate.push(
      Math.round(Math.max(-12, Math.min(12, (nx - px) * 0.9)) * (1 - t) * 10) /
        10,
    );
    scale.push(Math.round((0.5 + 0.5 * easeInOut(t)) * 1000) / 1000);
    opacity.push(Math.min(1, t * 8));
  }
  return { x, y, rotate, scale, opacity };
})();

const FLIGHT_TRANSITION: Transition = {
  duration: 2.6,
  delay: 0.45,
  ease: "linear",
};

function logoState(step: number): LogoState {
  if (step >= SETTLED) return "idle";
  if (step >= LANDED) return "done";
  return "flying";
}

export function BeeTitle() {
  const step = useDeckStep();
  const landed = step >= LANDED;
  const settled = step >= SETTLED;

  return (
    <Shell center className="gap-8">
      <m.div
        initial={{ opacity: 0, x: -760, y: 220, scale: 0.5, rotate: 0 }}
        animate={FLIGHT}
        transition={FLIGHT_TRANSITION}
      >
        <m.div
          animate={settled ? { y: [0, -8, 0] } : { y: 0 }}
          transition={
            settled
              ? { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
              : { duration: DUR.base }
          }
        >
          <BeeLogo size={168} state={logoState(step)} />
        </m.div>
      </m.div>

      <m.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={
          landed
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 18, scale: 0.96 }
        }
        transition={cueTransition(landed, 0.15, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        <Title size="xl">
          <Accent>Bee</Accent>
        </Title>
      </m.div>

      <m.p
        className="text-3xl text-balance text-[#2a1e0c]/70"
        initial={{ opacity: 0, y: 14 }}
        animate={settled ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
        transition={cueTransition(settled, 0.1, {
          duration: DUR.hero,
          ease: EASE.expo,
        })}
      >
        It listens to your meeting and finds what you already know
      </m.p>
    </Shell>
  );
}
