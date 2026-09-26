import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { Accent, Shell } from "../../_components/DeckPrimitives";
import { BRAND, EASE, MaskedText } from "../../_components/motion";

/** Painted once; only its transform and opacity move. */
const HALO = `radial-gradient(circle, ${BRAND.purple}2e, ${BRAND.purple}14 30%, ${BRAND.blue}08 48%, transparent 64%)`;

/**
 * The mark arrives first: it turns into place out of a small scale while a
 * soft halo opens behind it and one ring spreads out as it lands. Then the
 * title rises word by word, and the line under it follows.
 */
function Emblem() {
  return (
    <div className="relative mb-12 grid size-[88px] place-items-center">
      <m.span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: EASE.expo, delay: 0.1 }}
      >
        <m.span
          className="absolute inset-0 rounded-full"
          style={{ background: HALO }}
          animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
          transition={{
            duration: 7,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 1.7,
          }}
        />
      </m.span>
      <m.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ border: `1.5px solid ${BRAND.purple}` }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 3], opacity: [0.7, 0] }}
        transition={{ duration: 1.4, ease: EASE.out, delay: 0.55 }}
      />
      <m.div
        initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{
          duration: 1.3,
          ease: EASE.expo,
          delay: 0.15,
          opacity: { duration: 0.4, delay: 0.15 },
        }}
      >
        <m.div
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 6,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 1.5,
          }}
        >
          <LogoMark size={88} />
        </m.div>
      </m.div>
    </div>
  );
}

/** Opening slide of the annual CDM deck. */
export function AnnualTitle() {
  return (
    <Shell center>
      <div className="relative isolate flex flex-col items-center">
        <Emblem />

        <h1 className="text-8xl leading-[1.02] font-semibold tracking-[-0.025em] text-white">
          <MaskedText delay={0.55} stagger={0.09} duration={1.1}>
            A year of
            <br />
            building <Accent>Eva.</Accent>
          </MaskedText>
        </h1>

        <p className="mt-8 max-w-2xl text-xl leading-relaxed text-white/55">
          <MaskedText delay={1.25} stagger={0.035} duration={0.9}>
            From an empty repository to how we build software.
          </MaskedText>
        </p>
      </div>
    </Shell>
  );
}

/** Kept so the deck list keeps working while the slide order is rewritten. */
export { AnnualTitle as AnnualTitlePlaceholder };
