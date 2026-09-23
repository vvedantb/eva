import { m } from "motion/react";
import {
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
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
        <Kicker>Foundations</Kicker>
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

      <m.div
        className="relative mt-16 flex h-[58px] w-fit items-center gap-8 rounded-[18px] bg-white/[0.04] px-6"
        animate={{
          opacity: removed ? 0.28 : 1,
          filter: removed ? "blur(2px)" : "blur(0px)",
        }}
        transition={{
          duration: removed ? 0.8 : 0.3,
          ease: EASE_OUT,
          delay: removed ? 0.55 : 0,
        }}
      >
        <span className="text-lg text-white/70">Old command-line runner</span>
        <span className="text-sm tabular-nums text-white/45">
          deleted 18 August
        </span>

        <m.div
          className="absolute inset-x-6 top-1/2 h-px origin-left bg-white/70"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: removed ? 1 : 0 }}
          transition={{
            duration: removed ? 0.5 : 0.2,
            ease: EASE_OUT,
          }}
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
