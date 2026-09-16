import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { BlurWordsTitle } from "../_components/BlurWordsTitle";
import { Body, Reveal, Shell } from "../_components/DeckPrimitives";

export function Slide01Title() {
  return (
    <Shell center>
      <Reveal from="none" blur={false}>
        <m.div
          className="mb-10"
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ duration: 8, ease: "easeInOut", repeat: Infinity }}
        >
          <LogoMark size={88} />
        </m.div>
      </Reveal>

      <BlurWordsTitle
        size="2xl"
        lines={["Three months", "of Eva."]}
        delay={0.4}
      />

      <Reveal delay={1.4}>
        <Body className="text-white/55">
          What changed between June and September 2026.
        </Body>
      </Reveal>
    </Shell>
  );
}
