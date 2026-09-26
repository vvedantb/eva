import { m } from "motion/react";
import { cn } from "@eva/ui";
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

/** Composition width, the slide's content column. */
const STAGE_W = 1088;
/** Each provider sits over a quarter mark, so the pair is centred. */
const DOCK_X: readonly [number, number] = [STAGE_W * 0.25, STAGE_W * 0.75];
/** The card travels this far, dock centre to dock centre. */
const TRAVEL = DOCK_X[1] - DOCK_X[0];
const BADGE_W = 240;
const TRAVEL_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];
const CARD_W = 460;
/** Badge height plus the gap down to the card's pad. */
const CARD_TOP = 100;
/** Header row, three bubbles and the card's padding. */
const CARD_H = 250;
/** The pad sits this far outside the card: 16px card radius + 12 = 28px. */
const PAD_INSET = 12;

const MESSAGES: readonly { text: string; mine: boolean }[] = [
  { text: "Add an export button", mine: true },
  { text: "Done, and pushed", mine: false },
  { text: "Now make it monthly", mine: true },
];

function Badge({ name, lit, x }: { name: string; lit: boolean; x: number }) {
  return (
    <m.div
      className="absolute top-0 flex h-[64px] items-center justify-center rounded-[20px] text-xl font-medium"
      style={{ left: x - BADGE_W / 2, width: BADGE_W }}
      animate={{
        backgroundColor: lit
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.04)",
        color: lit ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
        boxShadow: lit
          ? `0 0 0 1px ${BRAND.blue}88`
          : "0 0 0 1px rgba(255,255,255,0)",
      }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: lit ? 0.55 : 0 }}
    >
      {name}
    </m.div>
  );
}

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

export function AnnualHandoff() {
  const moved = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Handoff</Kicker>
        <Title size="md">Change your mind mid-job.</Title>
      </Reveal>

      <div className="flex flex-1 items-center pb-8">
        <Reveal delay={0.2} distance={20} className="relative">
          <div
            className="relative"
            style={{ width: STAGE_W, height: CARD_TOP + CARD_H + PAD_INSET }}
          >
            <Pad x={DOCK_X[0]} />
            <Pad x={DOCK_X[1]} />
            <Badge name="Claude" lit={!moved} x={DOCK_X[0]} />
            <Badge name="Cursor" lit={moved} x={DOCK_X[1]} />

            {/* The route between the two providers, drawn as the card leaves. */}
            <m.div
              className="absolute top-[31px] h-[2px] origin-left rounded-full"
              style={{
                left: DOCK_X[0] + BADGE_W / 2,
                width: TRAVEL - BADGE_W,
                background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={
                moved ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }
              }
              transition={{ duration: moved ? 0.7 : 0.3, ease: EASE_OUT }}
              aria-hidden
            />

            {/* The hero: the whole conversation lifts off one provider and
                lands on the other, word for word. */}
            <m.div
              className="absolute rounded-[16px] bg-white/[0.07] p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
              style={{
                left: DOCK_X[0] - CARD_W / 2,
                top: CARD_TOP,
                width: CARD_W,
              }}
              initial={false}
              animate={{
                x: moved ? TRAVEL : 0,
                y: [0, -18, 0],
                scale: [1, 1.04, 1],
              }}
              transition={{
                // Eased both ends, so the lift-off and the landing both read.
                x: { duration: 1.2, ease: TRAVEL_EASE },
                y: { duration: 1.2, ease: "easeInOut", times: [0, 0.5, 1] },
                scale: { duration: 1.2, ease: "easeInOut", times: [0, 0.5, 1] },
              }}
            >
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
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.9 }
                  }
                  transition={
                    moved
                      ? { type: "spring", bounce: 0, duration: 0.5, delay: 0.9 }
                      : { duration: 0.2, ease: EASE_OUT }
                  }
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
