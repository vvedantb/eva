import { IconLock } from "@tabler/icons-react";
import { m } from "motion/react";
import { useDeckStep } from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  EASE,
  Pulse,
  cueTransition,
} from "../../_components/motion";

const GATE_SIZE = 168;
const GATES: readonly { radius: number; width: number; colour: string }[] = [
  { radius: 72, width: 7, colour: BRAND.blue },
  { radius: 46, width: 7, colour: BRAND.purple },
];
/** Seconds for one gate to swing shut; the inner one follows the outer. */
const SHUT = 0.9;
const GATE_GAP = 0.3;
/** When the second gate has shut and the lock can drop in. */
export const MOA3_GATES_SHUT = GATE_GAP + SHUT;

/**
 * The two independent checks, drawn as concentric gates swinging shut. Each
 * ring turns as it closes from an open arc into a full circle, then a lock
 * lands in the middle and keeps a slow live pulse.
 */
export function MoA3Gates({ step }: { step: number }) {
  const closing = useDeckStep() >= step;
  const centre = GATE_SIZE / 2;

  return (
    <div className="relative" style={{ width: GATE_SIZE, height: GATE_SIZE }}>
      {GATES.map((gate, index) => {
        const circumference = 2 * Math.PI * gate.radius;
        const open = circumference * 0.62;
        const delay = index * GATE_GAP;
        return (
          <m.svg
            key={gate.radius}
            width={GATE_SIZE}
            height={GATE_SIZE}
            viewBox={`0 0 ${GATE_SIZE} ${GATE_SIZE}`}
            className="absolute inset-0"
            aria-hidden
            initial={{ rotate: -90 - 70 }}
            animate={{ rotate: closing ? -90 : -90 - 70 }}
            transition={cueTransition(closing, delay, {
              duration: SHUT,
              ease: EASE.expo,
            })}
          >
            <m.circle
              cx={centre}
              cy={centre}
              r={gate.radius}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={gate.width}
              initial={{ opacity: 0 }}
              animate={{ opacity: closing ? 1 : 0 }}
              transition={cueTransition(closing, delay, {
                duration: DUR.base,
                ease: EASE.out,
              })}
            />
            <m.circle
              cx={centre}
              cy={centre}
              r={gate.radius}
              fill="none"
              stroke={gate.colour}
              strokeWidth={gate.width}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: open, opacity: 0 }}
              animate={{
                strokeDashoffset: closing ? 0 : open,
                opacity: closing ? 1 : 0,
              }}
              transition={cueTransition(closing, delay, {
                duration: SHUT,
                ease: EASE.expo,
              })}
            />
          </m.svg>
        );
      })}

      <m.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={
          closing ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }
        }
        transition={cueTransition(closing, MOA3_GATES_SHUT - 0.15, {
          duration: DUR.slow,
          ease: EASE.expo,
        })}
      >
        <Pulse
          step={step}
          delay={MOA3_GATES_SHUT + 0.2}
          rings={2}
          period={2.6}
          reach={1.9}
          color={`${BRAND.blue}aa`}
          className="rounded-full"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-white/[0.09] text-white">
            <IconLock size={26} stroke={1.7} aria-hidden />
          </span>
        </Pulse>
      </m.div>
    </div>
  );
}
