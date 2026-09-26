import {
  IconArrowUp,
  IconCornerDownLeft,
  IconSlash,
  IconSparkles,
} from "@tabler/icons-react";
import { m } from "motion/react";
import { Camera } from "../../_components/DeckCamera";
import {
  Accent,
  BRAND,
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND_GRADIENT,
  DUR,
  EASE,
  MaskedText,
  Sheen,
  cueTransition,
} from "../../_components/motion";
import { Fri2Panel } from "../_parts/Fri2Panel";

/** Real commands from this codebase, shortest first so the list reads quickly. */
const SKILLS: readonly string[] = [
  "/ship",
  "/commit",
  "/standup",
  "/changelog",
  "/run-task",
  "/create-task",
];

const ROW_HEIGHT = 44;

/**
 * Step 0 frames the composer alone, lower-middle of the stage. On the slash the
 * camera settles down to its resting shot as the picker rises out of the
 * composer above it, the way the real slash menu opens.
 */
const SHOTS = [{ y: -120 }, {}];

function Row({ skill, index }: { skill: string; index: number }) {
  const open = useDeckStep() >= 1;
  const first = index === 0;
  // The menu opens upward, so the row nearest the composer lands first.
  const at = 0.18 + (SKILLS.length - 1 - index) * 0.05;

  return (
    <m.div
      className="relative isolate flex items-center gap-3 rounded-[12px] px-4"
      style={{ height: ROW_HEIGHT }}
      initial={{ opacity: 0, y: 12 }}
      animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={cueTransition(open, at, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      {first ? (
        <Sheen
          step={1}
          delay={0.75}
          className="absolute inset-0 -z-10 rounded-[12px] bg-white/[0.07]"
        >
          <span />
        </Sheen>
      ) : null}
      <IconSlash
        size={16}
        stroke={1.8}
        aria-hidden
        style={{ color: first ? BRAND.blue : undefined }}
        className={first ? undefined : "text-white/35"}
      />
      <span className="flex-1 text-lg text-white/85">{skill}</span>
      {first ? (
        <IconCornerDownLeft
          size={16}
          stroke={1.8}
          aria-hidden
          className="text-white/40"
        />
      ) : null}
    </m.div>
  );
}

function Composer() {
  const open = useDeckStep() >= 1;

  return (
    <div className="relative flex h-16 shrink-0 items-center rounded-full bg-white/[0.06] py-1 pr-1.5 pl-6 ring-1 ring-white/10">
      {/* The focus ring is its own layer, so only its opacity changes. */}
      <m.span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-full ring-1 ring-[#3B7DD8]/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: DUR.slow, ease: EASE.out }}
      />
      <span className="relative flex h-6 flex-1 items-center text-lg">
        <m.span
          className="absolute inset-0 text-white/50"
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ duration: DUR.fast }}
        >
          Ask Eva to build something...
        </m.span>
        <m.span
          className="text-white/85"
          initial={{ opacity: 0, y: 6 }}
          animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
          transition={cueTransition(open, 0.08, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        >
          /
        </m.span>
        <m.span
          aria-hidden
          className="ml-0.5 inline-block h-[1.1em] w-[2px] rounded-full bg-white/70"
          animate={{ opacity: [1, 1, 0, 0] }}
          transition={{
            duration: 1.1,
            times: [0, 0.5, 0.5, 1],
            ease: "linear",
            repeat: Infinity,
          }}
        />
      </span>
      <span className="relative flex size-[52px] items-center justify-center overflow-hidden rounded-full bg-white/15">
        <m.span
          aria-hidden
          className="absolute inset-0"
          style={{ background: BRAND_GRADIENT }}
          initial={{ opacity: 0 }}
          animate={{ opacity: open ? 1 : 0 }}
          transition={cueTransition(open, 0.2, {
            duration: DUR.slow,
            ease: EASE.out,
          })}
        />
        <IconArrowUp size={20} aria-hidden className="relative text-white" />
      </span>
    </div>
  );
}

export function FridaySkills() {
  const open = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconSparkles size={15} aria-hidden />
          Using Eva · Skills
        </span>
      </Kicker>
      <Title size="md">
        Never explain a job <Accent>twice</Accent>.
      </Title>
      <Body className="mt-4">
        <MaskedText delay={0.4} duration={0.8}>
          Turned on per codebase, from Settings.
        </MaskedText>
      </Body>

      <Camera shots={SHOTS} className="relative flex-1">
        <div className="absolute bottom-14 left-0 flex h-16 items-center text-3xl font-semibold whitespace-nowrap text-white">
          <MaskedText step={1} delay={0.5}>
            Type a slash. Pick the job.
          </MaskedText>
        </div>

        <m.div
          className="absolute right-0 bottom-14 w-[620px]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.35 }}
        >
          <m.div
            className="absolute right-0 bottom-full left-0 mb-3 origin-bottom"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={
              open
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 18, scale: 0.97 }
            }
            transition={cueTransition(open, 0.05, {
              duration: DUR.slow,
              ease: EASE.expo,
            })}
          >
            <Fri2Panel
              header={
                <>
                  <IconSlash size={13} aria-hidden />
                  <span>Skills</span>
                </>
              }
              bodyClassName="p-2"
            >
              {SKILLS.map((skill, index) => (
                <Row key={skill} skill={skill} index={index} />
              ))}
            </Fri2Panel>
          </m.div>
          <Composer />
        </m.div>
      </Camera>

      <Footnote>
        Eva&apos;s own skills landed 6 August 2026. Claude&apos;s built-in
        skills joined the same picker on 22 August 2026.
      </Footnote>
    </Shell>
  );
}
