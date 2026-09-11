import { IconRobot } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  EASE_OUT,
  Reveal,
  useDeckStep,
} from "../../_components/DeckPrimitives";

/** What the one person types. Short enough to sit on a single line. */
const MESSAGES = [
  "Ship the referral export fix",
  "Review overnight bug reports",
  "Draft the September changelog",
];

const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const LIT_STEP = 3;
const TILE_STAGGER = 0.08;

function AgentTile({ index, lit }: { index: number; lit: boolean }) {
  return (
    <m.div
      className={cn(
        "relative flex size-14 items-center justify-center rounded-xl",
        lit
          ? "bg-gradient-to-br from-[#8B3FB8]/40 to-[#3B7DD8]/40"
          : "bg-white/[0.05]",
      )}
      animate={{ scale: lit ? 1 : 0.97 }}
      transition={{
        duration: 0.4,
        ease: EASE_OUT,
        delay: lit ? index * TILE_STAGGER : 0,
      }}
    >
      <IconRobot size={20} className={lit ? "text-white" : "text-white/50"} />
      <m.span
        aria-hidden
        className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-400"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: lit ? 1 : 0,
          scale: lit ? 1 : 0.4,
        }}
        transition={{
          duration: 0.3,
          ease: EASE_OUT,
          delay: lit ? index * TILE_STAGGER + 0.1 : 0,
        }}
      />
    </m.div>
  );
}

/**
 * One chat window driving nine agents. The tiles only light up at the final
 * step, which is the point of the slide: the person stays in the chat.
 */
export function AgentFleet() {
  const lit = useDeckStep() >= LIT_STEP;

  return (
    <div className="flex items-center justify-center gap-8">
      <div className="w-[300px] rounded-2xl bg-white/[0.06] p-5">
        <div className="text-[11px] tracking-[0.18em] text-white/35 uppercase">
          Chat
        </div>
        <div className="mt-4 space-y-3">
          {MESSAGES.map((message, index) => (
            <Reveal key={message} delay={0.3 + index * 0.45} from="left">
              <div className="rounded-xl rounded-br-sm bg-white/[0.08] px-3 py-2 text-sm leading-snug text-white/80">
                {message}
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-3 gap-3">
          {TILES.map((index) => (
            <AgentTile key={index} index={index} lit={lit} />
          ))}
        </div>
        <m.div
          className="mt-5 w-[200px] text-xs leading-snug text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT, delay: lit ? 0.7 : 0 }}
        >
          One person, many agents. Each in its own sandbox.
        </m.div>
      </div>
    </div>
  );
}
