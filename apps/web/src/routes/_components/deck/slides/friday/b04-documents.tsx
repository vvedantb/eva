import { m } from "motion/react";
import {
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { Camera, Layer } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import {
  BRAND,
  DUR,
  EASE,
  LEAVE,
  Pulse,
  Sheen,
} from "../../_components/motion";
import { FriWindow } from "../_parts/FriMock";
import { MoF1Document } from "../_parts/MoF1Doc";

interface Version {
  label: string;
  when: string;
  colour: string;
}

/** Newest first. The times are the only numbers on the slide. */
const VERSIONS: readonly Version[] = [
  { label: "Zuza", when: "now", colour: BRAND.purple },
  { label: "Eva", when: "11:04", colour: BRAND.blue },
  { label: "Kezia", when: "09:20", colour: "rgba(52,211,153,0.8)" },
  { label: "Matt", when: "Tue", colour: "rgba(251,191,36,0.8)" },
];

/** The history swings forward a touch as it arrives, so it reads as a new layer. */
const SHOTS: readonly CameraShot[] = [{}, {}, { rotateY: -4, x: -6 }];

const ROW_H = 44;
const ROW_GAP = 8;

function VersionRow({ version, index }: { version: Version; index: number }) {
  const shown = useDeckStep() >= 2;
  const at = 0.3 + index * 0.09;
  const row = (
    <div className="flex h-11 items-center gap-3 rounded-[12px] bg-white/[0.05] px-3">
      {index === 0 ? (
        <Pulse
          step={2}
          delay={0.9}
          color={version.colour}
          size={8}
          rings={2}
          reach={2.4}
        />
      ) : (
        <span
          className="size-2 rounded-full"
          style={{ background: version.colour }}
        />
      )}
      <span className="flex-1 text-[13px] text-white/70">{version.label}</span>
      <span className="text-[12px] text-white/40 tabular-nums">
        {version.when}
      </span>
    </div>
  );

  return (
    <m.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : 18 }}
      transition={
        shown ? { duration: DUR.slow, ease: EASE.expo, delay: at } : LEAVE
      }
    >
      {index === 0 ? (
        <Sheen step={2} delay={0.8} className="rounded-[12px]">
          {row}
        </Sheen>
      ) : (
        row
      )}
    </m.div>
  );
}

function VersionList() {
  const shown = useDeckStep() >= 2;
  const rail = VERSIONS.length * (ROW_H + ROW_GAP) - ROW_GAP - ROW_H;

  return (
    <Layer depth={40} className="w-[300px] shrink-0">
      <m.div
        initial={{ opacity: 0, x: 40, scale: 0.97 }}
        animate={
          shown
            ? { opacity: 1, x: 0, scale: 1 }
            : { opacity: 0, x: 40, scale: 0.97 }
        }
        transition={
          shown
            ? {
                duration: DUR.hero,
                ease: EASE.expo,
                opacity: { duration: DUR.base },
              }
            : LEAVE
        }
      >
        <FriWindow
          label="History"
          className="h-[330px] w-full"
          bodyClassName="relative flex flex-col gap-2"
        >
          {/* The thread through every kept version, drawn newest to oldest. */}
          <m.span
            aria-hidden
            className="absolute w-px origin-top bg-white/15"
            style={{ left: 16 + 12 + 3.5, top: 16 + ROW_H / 2, height: rail }}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: shown ? 1 : 0 }}
            transition={
              shown ? { duration: 0.9, ease: EASE.inOut, delay: 0.35 } : LEAVE
            }
          />
          {VERSIONS.map((version, index) => (
            <VersionRow key={version.when} version={version} index={index} />
          ))}
        </FriWindow>
      </m.div>
    </Layer>
  );
}

export function FridayDocuments() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Using Eva · Documents</Kicker>
        <Title size="md">Write it down together.</Title>
      </Reveal>

      <Camera shots={SHOTS} className="mt-10">
        <div className="flex gap-6" style={{ transformStyle: "preserve-3d" }}>
          <Reveal delay={0.1} className="relative">
            <MoF1Document />
          </Reveal>
          <VersionList />
        </div>
      </Camera>

      <Footnote>Collaborative documents, 10 June 2026.</Footnote>
    </Shell>
  );
}
