import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { Body, Shell } from "../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  EASE,
  MaskedText,
  SplitReveal,
} from "../_components/motion";

/** The mark ignites first; the title rises out of its light. */
const IGNITE = { duration: 1.3, ease: EASE.expo };

function LogoIgnite() {
  return (
    <div className="relative mb-10 flex items-center justify-center">
      {/* A painted radial, never a filter: it only scales and fades. */}
      <m.span
        aria-hidden
        className="pointer-events-none absolute size-[300px] rounded-full"
        style={{
          background: `radial-gradient(circle closest-side, ${BRAND.purple}55, ${BRAND.blue}22 42%, transparent 70%)`,
        }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.9, 0.4], scale: 1 }}
        transition={{
          scale: IGNITE,
          opacity: { duration: 2, times: [0, 0.35, 1], ease: "easeOut" },
        }}
      />
      {/* One shockwave, once. */}
      <m.span
        aria-hidden
        className="pointer-events-none absolute size-[96px] rounded-full"
        style={{ border: `1.5px solid ${BRAND.blue}` }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.6, 0], scale: 2.6 }}
        transition={{
          duration: 1.5,
          ease: EASE.out,
          delay: 0.25,
          opacity: { duration: 1.5, times: [0, 0.15, 1], delay: 0.25 },
        }}
      />
      <m.div
        className="relative"
        initial={{ opacity: 0, scale: 0.35, rotate: -60 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ ...IGNITE, opacity: { duration: DUR.base } }}
      >
        {/* The eight-second breath the speaker notes mention. */}
        <m.div
          animate={{ scale: [1, 1.03, 1] }}
          transition={{
            duration: 8,
            ease: "easeInOut",
            repeat: Infinity,
            delay: 1.3,
          }}
        >
          <LogoMark size={88} />
        </m.div>
      </m.div>
    </div>
  );
}

export function Slide01Title() {
  return (
    <Shell center>
      {/* The whole frame settles a touch, like a lens finding focus. */}
      <m.div
        className="flex flex-col items-center"
        initial={{ scale: 1.035, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 2.6, ease: EASE.expo }}
      >
        <LogoIgnite />

        <h1 className="text-8xl leading-[1.02] font-semibold tracking-[-0.025em] text-balance text-white">
          <MaskedText delay={0.45} className="block">
            Three months
          </MaskedText>
          <span className="block">
            <MaskedText delay={0.62}>of</MaskedText>{" "}
            <SplitReveal
              text="Eva."
              accent
              delay={0.72}
              stagger={0.06}
              className="align-bottom"
            />
          </span>
        </h1>

        <Body className="text-white/55">
          <MaskedText delay={1.35} stagger={0.03}>
            What changed this summer, and what it means for you.
          </MaskedText>
        </Body>
      </m.div>
    </Shell>
  );
}
