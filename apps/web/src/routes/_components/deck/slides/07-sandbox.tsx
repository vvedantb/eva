import { IconBolt } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import { LinearCount, RaceLane } from "./_parts/BootRace";

export function Slide07Sandbox() {
  const running = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Kicker>Vercel Sandbox</Kicker>
      <Title size="md">
        From forty seconds to <Accent>under one</Accent>.
      </Title>
      <Body className="mt-4 max-w-4xl">
        Every session runs in its own cloud workspace. Starting one used to be a
        coffee break.
      </Body>

      <m.div
        className="mt-8 text-sm text-white/40"
        animate={{ opacity: running ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        Press → to start both workspaces
      </m.div>

      <div className="mt-2">
        <RaceLane
          label="Before · Daytona"
          running={running}
          duration={4}
          readout={
            <LinearCount
              tenths={400}
              duration={4}
              running={running}
              className="text-3xl font-semibold tracking-tight tabular-nums text-white/70"
            />
          }
          caption={
            <m.span
              initial={{ opacity: 0 }}
              animate={running ? { opacity: [0, 1, 1, 0] } : { opacity: 0 }}
              transition={{ duration: 4, ease: "linear" }}
            >
              …still starting
            </m.span>
          }
        />

        <RaceLane
          label="Now · Vercel Sandbox"
          running={running}
          duration={0.6}
          brand
          readout={
            <m.div
              className="flex items-center gap-2"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={
                running ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }
              }
              transition={
                running
                  ? { type: "spring", bounce: 0.35, duration: 0.6, delay: 0.6 }
                  : { duration: 0.2 }
              }
            >
              <IconBolt size={18} color={BRAND.blue} />
              <span className="text-3xl font-semibold tracking-tight tabular-nums text-white">
                &lt; 1 s
              </span>
            </m.div>
          }
        />
      </div>

      <Reveal step={1} delay={4.2} className="mt-6">
        <p className="max-w-4xl text-2xl leading-snug text-white/85">
          That is more than <Accent>40×</Accent> faster, and the same workspace
          underneath: terminal, live preview, desktop and snapshots.
        </p>
      </Reveal>

      <Footnote>
        Timings from the product owner's measurements before and after the move.
        Migration landed 6 to 8 July 2026.
      </Footnote>
    </Shell>
  );
}
