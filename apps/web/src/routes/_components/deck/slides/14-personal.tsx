import { m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import { EvaSidebarDemo } from "./_parts/EvaSidebarDemo";

/** The category, named without comment. The comment is in the notes. */
const SIMILAR: readonly string[] = [
  "Cursor background agents",
  "OpenAI Codex",
  "Claude Code on the web",
  "GitHub Copilot coding agent",
  "Google Jules",
  "Devin",
];

const OURS: readonly string[] = [
  "Built around our repos and rules",
  "New features in an afternoon",
  "Anything unused can go",
];

export function Slide14Personal() {
  const step = useDeckStep();

  return (
    <Shell className="py-10">
      <Reveal>
        <Kicker>Eva and everyone else</Kicker>
        <Title size="md" className="text-balance">
          Same idea. <Accent>Ours to shape.</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 flex gap-14">
        <div className="w-[600px] shrink-0">
          <Stagger delayChildren={0.3} className="flex flex-wrap gap-2.5">
            {SIMILAR.map((name) => (
              <StaggerItem
                key={name}
                className="rounded-full bg-white/[0.07] px-4 py-2 text-sm text-white/70"
              >
                {name}
              </StaggerItem>
            ))}
          </Stagger>

          <div className="relative mt-12 pl-6">
            <m.span
              aria-hidden
              className="absolute top-1 bottom-1 left-0 w-[3px] origin-top rounded-full bg-gradient-to-b from-[#8B3FB8] to-[#3B7DD8]"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: step >= 1 ? 1 : 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />
            <Stagger
              step={1}
              delayChildren={0.2}
              className="flex flex-col gap-5"
            >
              {OURS.map((item) => (
                <StaggerItem
                  key={item}
                  className="text-2xl font-semibold text-balance text-white"
                >
                  {item}
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>

        <div className="flex shrink-0 justify-center">
          <EvaSidebarDemo />
        </div>
      </div>

      <Reveal step={3} className="mt-6">
        <p className="text-2xl text-pretty text-white/85">
          Notion added features most people never open. The future fits{" "}
          <Accent>one person</Accent>, not everyone.
        </p>
      </Reveal>

      <Footnote>
        Product names are their owners&apos; trademarks. Comparison reflects our
        own use, September 2026.
      </Footnote>
    </Shell>
  );
}
