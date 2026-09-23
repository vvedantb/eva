import { IconArrowUp, IconSlash, IconSparkles } from "@tabler/icons-react";
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

const ROW_STAGGER = 0.07;

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
      <Body className="mt-4 max-w-3xl">
        Turned on per codebase, from Settings.
      </Body>

      <div className="mt-10 flex items-start gap-16">
        <div className="w-[520px]">
          <div className="flex h-14 items-center rounded-full bg-white/[0.06] py-1 pr-1.5 pl-5 ring-1 ring-white/10">
            <span className="relative h-5 flex-1 text-[15px]">
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
            <span className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <IconArrowUp size={18} aria-hidden className="text-white" />
            </span>
          </div>

          {/* The picker unrolls out of the composer, so its height is what
              animates and the rows ride down with it. */}
          <m.div
            className="origin-top overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: open ? 304 : 0, opacity: open ? 1 : 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.6 }}
          >
            <Fri2Panel
              className="mt-3"
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
                  className="flex h-9 items-center gap-3 rounded-[10px] px-3"
                  initial={{ opacity: 0, x: -14 }}
                  animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
                  transition={{
                    type: "spring",
                    bounce: 0,
                    duration: 0.5,
                    delay: open ? 0.16 + index * ROW_STAGGER : 0,
                  }}
                  style={
                    index === 0
                      ? { backgroundColor: "rgba(255,255,255,0.07)" }
                      : undefined
                  }
                >
                  <IconSlash
                    size={14}
                    stroke={1.8}
                    aria-hidden
                    style={{ color: index === 0 ? BRAND.blue : undefined }}
                    className={index === 0 ? undefined : "text-white/35"}
                  />
                  <span className="text-[15px] text-white/85">{skill}</span>
                </m.div>
              ))}
            </Fri2Panel>
          </m.div>
        </div>

        <m.div
          className="mt-3 w-[300px]"
          initial={{ opacity: 0, y: 16 }}
          animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{
            type: "spring",
            bounce: 0,
            duration: 0.6,
            delay: open ? 0.5 : 0,
          }}
        >
          <div className="text-2xl leading-snug font-semibold text-balance text-white">
            Type a slash. Pick the job.
          </div>
        </m.div>
      </div>

      <Footnote>
        Eva&apos;s own skills landed 6 August 2026. Claude&apos;s built-in
        skills joined the same picker on 22 August 2026.
      </Footnote>
    </Shell>
  );
}
