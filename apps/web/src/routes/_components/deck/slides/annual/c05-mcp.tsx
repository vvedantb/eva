import { m } from "motion/react";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  BRAND,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  Connector,
  DUR,
  EASE,
  Pulse,
  cueTransition,
} from "../../_components/motion";
import { MoA2OrbitRing } from "../_parts/MoA2OrbitRing";

const CENTRE_X = 544;
const CENTRE_Y = 240;
const RINGS: readonly number[] = [150, 205, 240];
const CORE = 104;

interface Chip {
  /** Which ring, and therefore which build step lights it. */
  ring: number;
  label: string;
  dx: number;
  dy: number;
}

/** Placed by hand: every chip sits on its ring and clears its neighbours. */
const CHIPS: readonly Chip[] = [
  { ring: 0, label: "List the work", dx: -150, dy: 0 },
  { ring: 0, label: "See what it is doing", dx: 150, dy: 0 },
  { ring: 1, label: "Chat into a session", dx: -176, dy: -105 },
  { ring: 1, label: "Start and stop workspaces", dx: 176, dy: -105 },
  { ring: 1, label: "Run code across tools", dx: 0, dy: 205 },
  { ring: 2, label: "Judge and score items", dx: -194, dy: 141 },
  { ring: 2, label: "Show panels in chat", dx: 194, dy: 141 },
];

/**
 * The diagram starts tipped back like a map on a table and squares up one
 * notch per ring, so each step reads as the reach of Eva growing towards you.
 */
const SHOTS: readonly CameraShot[] = [
  { rotateX: 9, scale: 0.95, y: 8 },
  { rotateX: 6, scale: 0.97, y: 4 },
  { rotateX: 3 },
  {},
];

/** Where along its ring a chip sits, for the order it lights in. */
function orderInRing(chip: Chip): number {
  return CHIPS.filter((other) => other.ring === chip.ring).indexOf(chip);
}

/** A spoke leaves the core's edge and stops at the chip's centre, under it. */
function spokeFrom(chip: Chip) {
  const length = Math.hypot(chip.dx, chip.dy) || 1;
  const edge = CORE / 2 + 8;
  return {
    x: CENTRE_X + (chip.dx / length) * edge,
    y: CENTRE_Y + (chip.dy / length) * edge,
  };
}

function ChipNode({ chip }: { chip: Chip }) {
  const lit = useDeckStep() >= chip.ring + 1;
  const at = 0.35 + orderInRing(chip) * 0.12;

  return (
    <>
      <Connector
        from={spokeFrom(chip)}
        to={{ x: CENTRE_X + chip.dx, y: CENTRE_Y + chip.dy }}
        step={chip.ring + 1}
        delay={at - 0.2}
        flow={false}
        strokeWidth={1}
      />
      <m.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1b1a22] px-4 py-2 text-sm whitespace-nowrap text-white/90 ring-1 ring-white/[0.08]"
        style={{ left: CENTRE_X + chip.dx, top: CENTRE_Y + chip.dy }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={lit ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={cueTransition(lit, at, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        {chip.label}
      </m.div>
    </>
  );
}

export function AnnualMcp() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Platform · Control panel</Kicker>
        <Title size="md">Other tools can drive Eva.</Title>
      </Reveal>

      <Camera shots={SHOTS} className="mt-4">
        <div className="relative h-[500px]">
          {RINGS.map((radius, index) => (
            <MoA2OrbitRing
              key={radius}
              cx={CENTRE_X}
              cy={CENTRE_Y}
              radius={radius}
              step={index + 1}
            />
          ))}

          {CHIPS.map((chip) => (
            <ChipNode key={chip.label} chip={chip} />
          ))}

          {/* Eva is live throughout: two slow rings breathe out of the core. */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: CENTRE_X, top: CENTRE_Y }}
          >
            <Pulse
              rings={2}
              reach={1.9}
              period={3.2}
              delay={0.6}
              className="rounded-full"
            >
              <div
                className="flex items-center justify-center rounded-full text-lg font-semibold text-white"
                style={{
                  width: CORE,
                  height: CORE,
                  background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
                }}
              >
                Eva
              </div>
            </Pulse>
          </div>
        </div>
      </Camera>

      <Footnote>
        Chat into a session, task or project 27 August; sandboxes 28 August;
        running code 3 September; typed judgements 17 September; panels in chat
        21 September 2026.
      </Footnote>
    </Shell>
  );
}
