import { IconArrowUp, IconSlash, IconSparkles } from "@tabler/icons-react";
import { m } from "motion/react";
import type { Transition } from "motion/react";
import {
  Accent,
  BRAND,
  Body,
  EASE_OUT,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
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

const ROW_STAGGER = 0.08;
const ROW_HEIGHT = 44;
/** Header and shell padding, body padding, the rows, then the gap above the composer. */
const PICKER_HEIGHT = 44 + 16 + SKILLS.length * ROW_HEIGHT + 12;

const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.6 };

/**
 * The composer and its picker sit in the middle of the space under the title.
 * The picker rises out of the composer, the way the real slash menu opens
 * above the input, and the tagline sits beside the composer on its centre line.
 */
export function FridaySkills() {
  const open = useDeckStep() >= 1;

  return (
    <Shell className="py-12">
      <Kicker>
        <span className="inline-flex items-center gap-2">
          <IconSparkles size={15} aria-hidden />
          Skills
        </span>
      </Kicker>
      <Title size="md">
        Ready-made <Accent>commands</Accent>.
      </Title>
      <Body className="mt-4">Turned on per codebase, from Settings.</Body>

      <div className="flex flex-1 items-center pb-6">
        <div className="flex w-full items-end justify-between">
          <m.div
            className="flex h-16 items-center text-3xl font-semibold whitespace-nowrap text-white"
            initial={{ opacity: 0, x: -16 }}
            animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
            transition={
              open
                ? { ...SPRING, delay: 0.5 }
                : { duration: 0.2, ease: EASE_OUT }
            }
          >
            Type a slash. Pick the job.
          </m.div>

          <div className="flex w-[620px] flex-col">
            {/* The picker's height is what animates; its rows are pinned to the
              bottom, so the panel rises out of the composer. */}
            <m.div
              className="flex flex-col justify-end overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: open ? PICKER_HEIGHT : 0,
                opacity: open ? 1 : 0,
              }}
              transition={SPRING}
            >
              <Fri2Panel
                className="mb-3"
                header={
                  <>
                    <IconSlash size={13} aria-hidden />
                    <span>Skills</span>
                  </>
                }
                bodyClassName="p-2"
              >
                {SKILLS.map((skill, index) => (
                  <m.div
                    key={skill}
                    className="flex items-center gap-3 rounded-[12px] px-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={
                      open ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                    }
                    transition={
                      open
                        ? { ...SPRING, delay: 0.16 + index * ROW_STAGGER }
                        : { duration: 0.15 }
                    }
                    style={{
                      height: ROW_HEIGHT,
                      backgroundColor:
                        index === 0 ? "rgba(255,255,255,0.07)" : undefined,
                    }}
                  >
                    <IconSlash
                      size={16}
                      stroke={1.8}
                      aria-hidden
                      style={{ color: index === 0 ? BRAND.blue : undefined }}
                      className={index === 0 ? undefined : "text-white/35"}
                    />
                    <span className="text-lg text-white/85">{skill}</span>
                  </m.div>
                ))}
              </Fri2Panel>
            </m.div>

            <div className="flex h-16 shrink-0 items-center rounded-full bg-white/[0.06] py-1 pr-1.5 pl-6 ring-1 ring-white/10">
              <span className="relative h-6 flex-1 text-lg">
                <m.span
                  className="absolute inset-0 text-white/50"
                  animate={{ opacity: open ? 0 : 1 }}
                  transition={{ duration: 0.25 }}
                >
                  Ask Eva to build something...
                </m.span>
                <m.span
                  className="absolute inset-0 text-white/85"
                  animate={{ opacity: open ? 1 : 0 }}
                  transition={{ duration: 0.25, delay: open ? 0.12 : 0 }}
                >
                  /
                </m.span>
              </span>
              <span className="flex size-[52px] items-center justify-center rounded-full bg-white/15">
                <IconArrowUp size={20} aria-hidden className="text-white" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <Footnote>
        Eva&apos;s own skills landed 6 August 2026. Claude&apos;s built-in
        skills joined the same picker on 22 August 2026.
      </Footnote>
    </Shell>
  );
}
