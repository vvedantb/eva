import { m } from "motion/react";
import {
  BRAND,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";

const CENTRE_X = 544;
const CENTRE_Y = 250;
const RINGS: readonly number[] = [150, 205, 250];

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
  { ring: 2, label: "Judge and score items", dx: -202, dy: 147 },
  { ring: 2, label: "Show panels in chat", dx: 202, dy: 147 },
];

function Ring({ radius, index }: { radius: number; index: number }) {
  const lit = useDeckStep() >= index + 1;

  return (
    <m.div
      className="absolute rounded-full border"
      style={{
        left: CENTRE_X - radius,
        top: CENTRE_Y - radius,
        width: radius * 2,
        height: radius * 2,
      }}
      animate={{
        borderColor: lit ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.05)",
        scale: lit ? 1 : 0.96,
      }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      aria-hidden
    />
  );
}

function ChipNode({ chip, index }: { chip: Chip; index: number }) {
  const lit = useDeckStep() >= chip.ring + 1;

  return (
    <m.div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-4 py-2 text-sm whitespace-nowrap"
      style={{ left: CENTRE_X + chip.dx, top: CENTRE_Y + chip.dy }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: lit ? 1 : 0,
        scale: lit ? 1 : 0.8,
        backgroundColor: lit
          ? "rgba(255,255,255,0.09)"
          : "rgba(255,255,255,0.02)",
        color: lit ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
      }}
      transition={
        lit
          ? {
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: index * 0.12,
            }
          : { duration: 0.25, ease: EASE_OUT }
      }
    >
      {chip.label}
    </m.div>
  );
}

export function AnnualMcp() {
  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Interfaces</Kicker>
        <Title size="md">Eva as a control panel.</Title>
      </Reveal>

      <div className="relative mt-4 h-[500px]">
        {RINGS.map((radius, index) => (
          <Ring key={radius} radius={radius} index={index} />
        ))}

        <div
          className="absolute flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{
            left: CENTRE_X,
            top: CENTRE_Y,
            background: `linear-gradient(135deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
        >
          Eva
        </div>

        {CHIPS.map((chip, index) => (
          <ChipNode key={chip.label} chip={chip} index={index} />
        ))}
      </div>

      <Footnote>
        Chat into a session, task or project 27 August; sandboxes 28 August;
        running code 3 September; typed judgements 17 September; panels in chat
        21 September 2026.
      </Footnote>
    </Shell>
  );
}
