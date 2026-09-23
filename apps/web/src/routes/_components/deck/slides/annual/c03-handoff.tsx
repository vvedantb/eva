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

/** The card travels this far, badge centre to badge centre. */
const TRAVEL = 430;

const MESSAGES: readonly { text: string; mine: boolean }[] = [
  { text: "Add an export button", mine: true },
  { text: "Done, and pushed", mine: false },
  { text: "Now make it monthly", mine: true },
];

function Badge({ name, lit }: { name: string; lit: boolean }) {
  return (
    <m.div
      className="flex h-[46px] w-[190px] items-center justify-center rounded-[14px] text-[15px] font-medium"
      animate={{
        backgroundColor: lit
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.04)",
        color: lit ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
        boxShadow: lit
          ? `0 0 0 1px ${BRAND.blue}66`
          : "0 0 0 1px rgba(255,255,255,0)",
      }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      {name}
    </m.div>
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

      <div className="relative mt-16 h-[340px]">
        <div className="absolute top-0 left-[135px]">
          <Badge name="Claude" lit={!moved} />
        </div>
        <div className="absolute top-0 left-[565px]">
          <Badge name="Cursor" lit={moved} />
        </div>

        <m.div
          className="absolute top-[110px] left-[40px] w-[380px] rounded-[20px] bg-white/[0.06] p-4"
          animate={{ x: moved ? TRAVEL : 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.95 }}
        >
          <div className="mb-4 flex gap-1.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
            <span className="h-2 w-2 rounded-full bg-white/20" />
          </div>

          <div className="flex flex-col gap-2.5">
            {MESSAGES.map((message) => (
              <div
                key={message.text}
                className={cn(
                  "max-w-[84%] rounded-[12px] px-3.5 py-2 text-sm",
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

        <m.div
          className="absolute top-[22px] left-[325px] h-[2px] w-[240px] origin-left rounded-full"
          style={{
            background: `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={
            moved ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }
          }
          transition={{
            duration: moved ? 0.6 : 0.3,
            ease: EASE_OUT,
          }}
          aria-hidden
        />
      </div>

      <Footnote>
        Cross-provider handoffs carry the conversation, 24 August 2026.
      </Footnote>
    </Shell>
  );
}
