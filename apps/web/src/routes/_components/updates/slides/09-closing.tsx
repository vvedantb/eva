import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { BRAND, Body, Reveal, Shell } from "../_components/DeckPrimitives";

export function Slide09Closing() {
  return (
    <Shell center>
      <BlurWordsTitle size="xl" lines={["Built in Eva,", "by Eva."]} />

      <Reveal delay={1.2}>
        <Body className="text-white/50">Including this deck.</Body>
      </Reveal>

      <Reveal delay={1.8} className="mt-12">
        <div className="relative flex items-center justify-center">
          <m.div
            aria-hidden
            className="pointer-events-none absolute size-40 rounded-full opacity-20 blur-[2px]"
            style={{
              background: `conic-gradient(from 0deg, transparent, ${BRAND.purple}, ${BRAND.blue}, transparent)`,
              maskImage:
                "radial-gradient(circle, transparent 58%, black 62%, black 72%, transparent 76%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 28, ease: "linear", repeat: Infinity }}
          />
          <LogoMark size={40} />
        </div>
      </Reveal>
    </Shell>
  );
}
