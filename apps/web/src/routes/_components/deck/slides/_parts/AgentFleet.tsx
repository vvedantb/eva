import { IconRobot } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import { Layer } from "../../_components/DeckCamera";
import { useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, LEAVE, MaskedText, Sheen } from "../../_components/motion";
import { EvaChatWindow } from "./EvaChatWindow";

const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const LIT_STEP = 3;
const TILE_STAGGER = 0.07;
const WAVE_START = 0.35;

/** The wave runs outward from the chat: column by column, then down each one. */
const waveAt = (index: number) =>
  WAVE_START + ((index % 3) * 2 + Math.floor(index / 3)) * TILE_STAGGER;

function AgentTile({ index, lit }: { index: number; lit: boolean }) {
  const at = waveAt(index);
  return (
    <m.div
      className="relative flex size-14 items-center justify-center rounded-xl bg-white/[0.05]"
      initial={false}
      animate={lit ? { scale: [0.97, 1.08, 1] } : { scale: 0.97 }}
      transition={
        lit
          ? {
              duration: DUR.slow,
              times: [0, 0.4, 1],
              ease: EASE.out,
              delay: at,
            }
          : LEAVE
      }
    >
      {/* The lit fill fades in over the resting tone rather than swapping classes. */}
      <m.span
        aria-hidden
        className="absolute inset-0 rounded-[inherit] bg-gradient-to-br from-[#8B3FB8]/45 to-[#3B7DD8]/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: lit ? 1 : 0 }}
        transition={lit ? { duration: DUR.base, delay: at } : LEAVE}
      />
      <IconRobot
        size={20}
        className={cn(
          "relative transition-colors duration-500",
          lit ? "text-white" : "text-white/50",
        )}
      />
      <m.span
        aria-hidden
        className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-400"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.4 }}
        transition={
          lit
            ? { duration: DUR.base, ease: EASE.expo, delay: at + 0.15 }
            : LEAVE
        }
      />
    </m.div>
  );
}

/**
 * One chat window driving nine agents. The tiles only light up at the final
 * step, which is the point of the slide: the person stays in the chat.
 *
 * The chat sits in front of the grid on separate `Layer` depths, so the slide's
 * `Camera` gives the person real standing over the fleet behind them.
 */
export function AgentFleet() {
  const lit = useDeckStep() >= LIT_STEP;

  return (
    <div
      className="flex items-center justify-center gap-8"
      style={{ transformStyle: "preserve-3d" }}
    >
      <Layer depth={40}>
        <EvaChatWindow />
      </Layer>

      <Layer depth={-20}>
        <Sheen step={LIT_STEP} delay={1.1} className="rounded-xl">
          <div className="grid grid-cols-3 gap-3">
            {TILES.map((index) => (
              <AgentTile key={index} index={index} lit={lit} />
            ))}
          </div>
        </Sheen>
        <div className="mt-5 w-[200px] text-xs leading-snug text-white/50">
          <MaskedText
            step={LIT_STEP}
            delay={0.9}
            stagger={0.03}
            duration={DUR.slow}
          >
            One person, many agents. Each in its own sandbox.
          </MaskedText>
        </div>
      </Layer>
    </div>
  );
}
