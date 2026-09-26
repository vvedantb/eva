import { m } from "motion/react";
import {
  Accent,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
  useDeckStep,
} from "../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  LEAVE,
  MaskedText,
  Spotlight,
} from "../_components/motion";
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

/** Each step pulls focus to the part that carries it: ours, the demo, the line. */
const LIGHT = [
  null,
  { x: 300, y: 360, size: 520 },
  { x: 930, y: 370, size: 560 },
  { x: 560, y: 600, size: 640 },
];

const fade = (to: number) => ({
  animate: { opacity: to },
  transition: { duration: DUR.slow, ease: EASE.out },
});

export function Slide14Personal() {
  const step = useDeckStep();

  return (
    <Shell className="isolate py-10">
      <Spotlight shots={LIGHT} />
      <Reveal>
        <Kicker>What&apos;s next · Eva and the rest</Kicker>
        <Title size="md" className="text-balance">
          Same idea. <Accent>Ours to shape.</Accent>
        </Title>
      </Reveal>

      <div className="mt-10 flex gap-14">
        <div className="w-[600px] shrink-0">
          {/* The category steps back once ours is named. */}
          <m.div initial={false} {...fade(step >= 1 ? 0.4 : 1)}>
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
          </m.div>

          <m.div
            className="relative mt-12 pl-6"
            initial={false}
            {...fade(step >= 2 ? 0.5 : 1)}
          >
            <m.span
              aria-hidden
              className="absolute top-1 bottom-1 left-0 w-[3px] origin-top rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: step >= 1 ? 1 : 0 }}
              transition={
                step >= 1 ? { duration: DUR.hero, ease: EASE.expo } : LEAVE
              }
            />
            <div className="flex flex-col gap-5">
              {OURS.map((item, index) => (
                <div
                  key={item}
                  className="text-2xl font-semibold text-balance text-white"
                >
                  <MaskedText step={1} delay={0.15 + index * 0.14}>
                    {item}
                  </MaskedText>
                </div>
              ))}
            </div>
          </m.div>
        </div>

        <m.div
          className="flex shrink-0 justify-center"
          style={{ transformPerspective: 1200 }}
          initial={{ opacity: 0, x: 48, rotateY: -12 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{
            duration: 1.2,
            ease: EASE.expo,
            delay: 0.35,
            opacity: { duration: DUR.slow, delay: 0.35 },
          }}
        >
          <EvaSidebarDemo />
        </m.div>
      </div>

      <div className="mt-6 text-2xl text-pretty text-white/85">
        <MaskedText step={3} delay={0.1} stagger={0.045}>
          Notion added features most people never open. The future fits{" "}
          <Accent>one person</Accent>, not everyone.
        </MaskedText>
      </div>

      <Footnote>
        Product names are their owners&apos; trademarks. Comparison reflects our
        own use, September 2026.
      </Footnote>
    </Shell>
  );
}
