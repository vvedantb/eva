import { IconBolt } from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import { Camera } from "../_components/DeckCamera";
import type { CameraShot } from "../_components/DeckCamera";
import { EASE, LEAVE, MaskedText, Sheen } from "../_components/motion";
import { LinearCount, RaceLane } from "./_parts/BootRace";

/**
 * The lanes tilt away like a track once the race starts. The angle is kept low
 * on purpose: the timing readouts have to stay readable from the back of the
 * room, and anything past about 8 degrees starts to thin the digits out.
 */
const RACE_SHOTS: readonly CameraShot[] = [
  {},
  { rotateX: 8, translateZ: 40, y: -10 },
];

export function Slide07Sandbox() {
  const running = useDeckStep() >= 1;

  return (
    <Shell className="py-14">
      <Kicker>Three months · Workspaces</Kicker>
      <Title size="md">
        From forty seconds to <Accent>under one</Accent>.
      </Title>
      <Body className="mt-4 max-w-4xl">
        Every job gets its own cloud workspace. Starting one used to take a
        coffee break.
      </Body>

      <m.div
        className="mt-8 text-sm text-white/40"
        animate={{ opacity: running ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        Press → to start both workspaces
      </m.div>

      <Camera shots={RACE_SHOTS} className="mt-2">
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
              initial={{ opacity: 0, x: -18, scale: 0.9 }}
              animate={
                running
                  ? { opacity: 1, x: 0, scale: 1 }
                  : { opacity: 0, x: -18, scale: 0.9 }
              }
              transition={
                running
                  ? {
                      duration: 0.8,
                      ease: EASE.expo,
                      delay: 0.45,
                      opacity: { duration: 0.2, delay: 0.45 },
                    }
                  : LEAVE
              }
            >
              <IconBolt size={18} color={BRAND.blue} />
              {/* The finish: one band of light across the winning time. */}
              <Sheen step={1} delay={0.7} className="-mx-2 rounded-[8px] px-2">
                <span className="text-3xl font-semibold tracking-tight tabular-nums text-white">
                  &lt; 1 s
                </span>
              </Sheen>
            </m.div>
          }
        />
      </Camera>

      <p className="mt-6 max-w-4xl text-2xl leading-snug text-white/85">
        <MaskedText step={1} delay={4.2} stagger={0.035}>
          That is more than <Accent>40×</Accent> faster, and the same workspace
          underneath: terminal, live preview, desktop and snapshots.
        </MaskedText>
      </p>

      <Footnote>
        Timings from the product owner's measurements before and after the move.
        Migration landed 6 to 8 July 2026.
      </Footnote>
    </Shell>
  );
}
