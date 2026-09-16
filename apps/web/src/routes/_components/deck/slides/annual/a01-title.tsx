import { m } from "motion/react";
import { LogoMark } from "@/lib/components/LogoMark";
import { BlurWordsTitle } from "../../_components/BlurWordsTitle";
import { Body, Reveal, Shell } from "../../_components/DeckPrimitives";

/** Opening slide of the annual CDM deck. */
export function AnnualTitle() {
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
        lines={["A year of", "building Eva."]}
        delay={0.4}
      />

      <Reveal delay={1.4}>
        <Body className="text-white/55">
          From an empty repository in January to how we build everything.
        </Body>
      </Reveal>
    </Shell>
  );
}

/** Kept so the deck list keeps working while the slide order is rewritten. */
export { AnnualTitle as AnnualTitlePlaceholder };
