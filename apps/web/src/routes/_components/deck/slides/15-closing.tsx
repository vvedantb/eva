import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { Accent, BRAND, Shell, Title } from "../_components/DeckPrimitives";
import { DUR, DrawPath, EASE, MaskedText } from "../_components/motion";

const RING = 160;
const RADIUS = 72;
/** A full circle, started at twelve o'clock so the draw reads as a clock hand. */
const CIRCLE = `M${RING / 2} ${RING / 2 - RADIUS} A${RADIUS} ${RADIUS} 0 1 1 ${RING / 2 - 0.01} ${RING / 2 - RADIUS}`;

const LOGO_AT = 1.4;

/**
 * The last word of both decks. No build steps, so the whole slide is one
 * sequence on entry: the statement rises word by word, the line under it
 * follows, then the mark turns into place as a ring draws round it.
 */
export function Slide15Closing() {
  return (
    <Shell center>
      <Title size="xl" className="leading-[1.02] tracking-[-0.025em]">
        Built in <Accent>Eva,</Accent>
        <br />
        by <Accent>Eva.</Accent>
      </Title>

      <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white/50">
        <MaskedText delay={1.1} duration={DUR.slow + 0.2}>
          Including this deck.
        </MaskedText>
      </p>

      <div
        className="relative mt-12 flex items-center justify-center"
        style={{ width: RING, height: RING }}
      >
        {/* The slow turning halo. No blur: it spins for as long as the slide is up. */}
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${BRAND.purple}, ${BRAND.blue}, transparent)`,
            maskImage:
              "radial-gradient(circle, transparent 58%, black 62%, black 72%, transparent 76%)",
          }}
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 0.2, rotate: 360 }}
          transition={{
            opacity: { duration: 1.2, delay: LOGO_AT + 0.9 },
            rotate: { duration: 28, ease: "linear", repeat: Infinity },
          }}
        />
        <DrawPath
          d={CIRCLE}
          width={RING}
          height={RING}
          delay={LOGO_AT + 0.1}
          duration={1.1}
          strokeWidth={1}
          dot
          className="pointer-events-none absolute inset-0 opacity-60"
        />
        <m.div
          initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{
            duration: 1.2,
            ease: EASE.expo,
            delay: LOGO_AT,
            opacity: { duration: DUR.base, delay: LOGO_AT },
          }}
        >
          <LogoMark size={40} />
        </m.div>
      </div>
    </Shell>
  );
}
