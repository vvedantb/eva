import { m } from "motion/react";
import {
  Body,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { DUR, EASE, cueTransition } from "../../_components/motion";
import { AnnBConnection } from "../_parts/AnnBConnection";

/** In the order the connections were rebuilt. */
const CONNECTIONS: readonly { label: string; date: string }[] = [
  { label: "Cursor", date: "5 August" },
  { label: "Codex", date: "12 August" },
  { label: "OpenCode", date: "14 August" },
];

export function AnnualSdks() {
  const removed = useDeckStep() >= 2;

  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Platform · Connections</Kicker>
        <Title size="md">Built on proper connections.</Title>
        <Body className="mt-4 max-w-3xl text-lg">
          Fewer silent failures, and faster replies.
        </Body>
      </Reveal>

      <div className="mt-14">
        {CONNECTIONS.map((connection, index) => (
          <AnnBConnection
            key={connection.label}
            label={connection.label}
            date={connection.date}
            index={index}
            step={1}
          />
        ))}
      </div>

      {/* The old runner is struck through, then steps back out of the way. */}
      <m.div
        className="relative mt-16 flex h-[58px] w-fit items-center gap-8 rounded-[18px] bg-white/[0.04] px-6"
        initial={{ opacity: 1, scale: 1, y: 0 }}
        animate={
          removed
            ? { opacity: 0.28, scale: 0.97, y: 6 }
            : { opacity: 1, scale: 1, y: 0 }
        }
        transition={cueTransition(removed, 0.55, {
          duration: DUR.slow,
          ease: EASE.out,
        })}
      >
        <span className="text-lg text-white/70">Old command-line runner</span>
        <span className="text-sm tabular-nums text-white/45">
          deleted 18 August
        </span>

        <m.div
          className="absolute inset-x-6 top-1/2 h-px origin-left bg-white/70"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: removed ? 1 : 0 }}
          transition={cueTransition(removed, 0, {
            duration: DUR.slow,
            ease: EASE.inOut,
          })}
          aria-hidden
        />
      </m.div>

      <Footnote>
        Cursor 5 August, Codex 12 August, OpenCode 14 August 2026. The old
        command-line runner was deleted on 18 August 2026.
      </Footnote>
    </Shell>
  );
}
