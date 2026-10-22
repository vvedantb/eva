import { m } from "motion/react";
import { Accent, Shell, Title } from "../../_components/DeckPrimitives";
import { DUR, EASE } from "../../_components/motion";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_SPRING } from "./_parts/BeeIsland";

export function BeeClose() {
  return (
    <Shell center className="gap-10">
      <m.div
        initial={{ opacity: 0, scale: 0.6, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...BEE_SPRING, duration: 1, delay: 0.1 }}
      >
        <m.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <BeeLogo size={132} />
        </m.div>
      </m.div>
      <Title size="lg">
        Try it in your <Accent>next meeting</Accent>.
      </Title>
      <m.p
        className="text-2xl text-[#2a1e0c]/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.9 }}
      >
        For Windows and Mac.
      </m.p>
    </Shell>
  );
}
