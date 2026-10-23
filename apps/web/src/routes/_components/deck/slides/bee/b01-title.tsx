import { m } from "motion/react";
import { Accent, Shell, Title } from "../../_components/DeckPrimitives";
import { DUR, EASE } from "../../_components/motion";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_SPRING } from "./_parts/BeeIsland";

export function BeeTitle() {
  return (
    <Shell center className="gap-8">
      <m.div
        initial={{ opacity: 0, scale: 0.4, rotate: -18, y: 30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={{ ...BEE_SPRING, duration: 1.1, delay: 0.15 }}
      >
        {/* A slow hover, as if it is flying in place. */}
        <m.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <BeeLogo size={168} />
        </m.div>
      </m.div>
      <Title size="xl">
        <Accent>Bee</Accent>
      </Title>
      <m.p
        className="text-3xl text-balance text-[#2a1e0c]/70"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.9 }}
      >
        It listens to your meeting and finds what you already know.
      </m.p>
    </Shell>
  );
}
