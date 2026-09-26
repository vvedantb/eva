import { IconArrowUp } from "@tabler/icons-react";
import { m } from "motion/react";
import { cn } from "@eva/ui";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { MoA2HandoffBadge } from "../_parts/MoA2HandoffBadge";
import {
  BRAND_GRADIENT,
  Connector,
  DUR,
  EASE,
  Sheen,
  cueTransition,
} from "../../_components/motion";

/** Composition width, the slide's content column. */
const STAGE_W = 1088;
/** Each provider sits over a quarter mark, so the pair is centred. */
const DOCK_X: readonly [number, number] = [STAGE_W * 0.25, STAGE_W * 0.75];
/** The card travels this far, dock centre to dock centre. */
const TRAVEL = DOCK_X[1] - DOCK_X[0];
const BADGE_W = 240;
const BADGE_H = 64;
const CARD_W = 460;
/** Badge height plus the gap down to the card's pad. */
const CARD_TOP = 100;
/** Header row, three bubbles, the composer and the card's padding. */
const CARD_H = 306;
/** The pad sits this far outside the card: 16px card radius + 12 = 28px. */
const PAD_INSET = 12;
/** Seconds for the conversation to cross from one provider to the other. */
const FLIGHT = 1.2;

const MESSAGES: readonly { text: string; mine: boolean }[] = [
  { text: "Add an export button", mine: true },
  { text: "Done, and pushed", mine: false },
  { text: "Now make it monthly", mine: true },
];

/** The empty place under each provider where the conversation can land. */
function Pad({ x }: { x: number }) {
  return (
    <div
      aria-hidden
      className="absolute rounded-[28px] bg-white/[0.025]"
      style={{
        left: x - CARD_W / 2 - PAD_INSET,
        top: CARD_TOP - PAD_INSET,
        width: CARD_W + PAD_INSET * 2,
        height: CARD_H + PAD_INSET * 2,
      }}
    />
  );
}

function Conversation({ moved }: { moved: boolean }) {
  return (
    <Sheen step={1} delay={FLIGHT - 0.1} className="rounded-[16px]">
      <div className="bg-white/[0.07] p-5" style={{ height: CARD_H }}>
        <div className="mb-4 flex h-6 items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-white/20" />
          </div>
          <m.span
            className="rounded-full bg-white/[0.08] px-3 py-0.5 text-sm text-white/70"
            initial={false}
            animate={
              moved
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0, scale: 0.9, y: 4 }
            }
            transition={cueTransition(moved, FLIGHT - 0.25, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            Handed over from Claude
          </m.span>
        </div>

        <div className="flex flex-col gap-3">
          {MESSAGES.map((message) => (
            <div
              key={message.text}
              className={cn(
                "max-w-[84%] rounded-[8px] px-4 py-2.5 text-lg",
                message.mine
                  ? "self-end bg-white/[0.12] text-white/90"
                  : "self-start bg-white/[0.05] text-white/70",
              )}
            >
              {message.text}
            </div>
          ))}
        </div>

        {/* An empty composer, so the card reads as a live chat, not a quote. */}
        <div
          aria-hidden
          className="mt-4 flex h-11 items-center gap-3 rounded-[12px] bg-white/[0.04] pr-1.5 pl-4"
        >
          <span className="h-2 w-40 rounded-full bg-white/[0.08]" />
          <span
            className="ml-auto flex size-8 items-center justify-center rounded-[8px] text-white"
            style={{ background: BRAND_GRADIENT }}
          >
            <IconArrowUp size={16} stroke={2} />
          </span>
        </div>
      </div>
    </Sheen>
  );
}

export function AnnualHandoff() {
  const moved = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Platform · Handoff</Kicker>
        <Title size="md">Change your mind mid-job.</Title>
      </Reveal>

      <div className="flex flex-1 items-center pb-6">
        <Reveal delay={0.2} distance={20} className="relative">
          <div
            className="relative"
            style={{ width: STAGE_W, height: CARD_TOP + CARD_H + PAD_INSET }}
          >
            <Pad x={DOCK_X[0]} />
            <Pad x={DOCK_X[1]} />
            <MoA2HandoffBadge
              name="Claude"
              lit={!moved}
              x={DOCK_X[0]}
              landAt={FLIGHT}
            />
            <MoA2HandoffBadge
              name="Cursor"
              lit={moved}
              x={DOCK_X[1]}
              landAt={FLIGHT}
              receives
            />

            {/* The route between the two providers: drawn as the card leaves,
                then work keeps flowing along it. */}
            <Connector
              from={{ x: DOCK_X[0] + BADGE_W / 2 + 10, y: BADGE_H / 2 }}
              to={{ x: DOCK_X[1] - BADGE_W / 2 - 10, y: BADGE_H / 2 }}
              step={1}
              flowPeriod={1.1}
            />

            {/* The hero: the whole conversation lifts off one provider and
                lands on the other, word for word. */}
            <m.div
              className="absolute rounded-[16px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
              style={{
                left: DOCK_X[0] - CARD_W / 2,
                top: CARD_TOP,
                width: CARD_W,
              }}
              initial={false}
              animate={
                moved
                  ? {
                      x: TRAVEL,
                      y: [0, -22, 0],
                      scale: [1, 1.04, 1],
                      rotate: [0, -1.5, 0],
                    }
                  : {
                      x: 0,
                      y: [0, -14, 0],
                      scale: [1, 1.02, 1],
                      rotate: [0, 1, 0],
                    }
              }
              transition={{
                // Eased both ends, so the lift-off and the landing both read.
                x: { duration: FLIGHT, ease: EASE.inOut },
                default: {
                  duration: FLIGHT,
                  ease: "easeInOut",
                  times: [0, 0.5, 1],
                },
              }}
            >
              <Conversation moved={moved} />
            </m.div>
          </div>
        </Reveal>
      </div>

      <Footnote>
        Cross-provider handoffs carry the conversation, 24 August 2026.
      </Footnote>
    </Shell>
  );
}
