import { IconFileText, IconMicrophone } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, Title, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Connector, DUR, EASE, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_CARD } from "./_parts/BeeBits";

const SHARE = 1;
const LABEL = 2;

const W = 1088;
const H = 440;

interface Person {
  name: string;
  y: number;
}

/** Each teammate runs their own Bee. Names are examples. */
const PEOPLE: readonly Person[] = [
  { name: "Alex", y: 40 },
  { name: "Sam", y: 180 },
  { name: "Jo", y: 320 },
];

/** The shared summary, with who said what. Example lines. */
const LINES = [
  { who: "Alex", text: "Acme wants to sign by Friday." },
  { who: "Sam", text: "I will send the contract today." },
  { who: "Jo", text: "Let's keep year-one pricing." },
];

const PERSON = { x: 0, w: 250, h: 86 };
const DOC = { x: 520, w: 568 };

const SHOTS: readonly CameraShot[] = [
  { rotateY: 8, translateZ: -30, x: 60 },
  { rotateY: 3 },
  { rotateY: -4, x: -40 },
];

function PersonCard({ person, index }: { person: Person; index: number }) {
  const step = useDeckStep();
  return (
    <m.div
      className="absolute flex items-center gap-4 rounded-[24px] px-5"
      style={{
        left: PERSON.x,
        top: person.y,
        width: PERSON.w,
        height: PERSON.h,
        background: BEE.surface,
        color: BEE.text,
      }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0, scale: step === SHARE ? [1, 1.04, 1] : 1 }}
      transition={{
        ...BEE_SPRING,
        delay: 0.2 + index * 0.1,
        scale: { duration: 0.5, delay: 0.2 + index * 0.25 },
      }}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-[#fffaf0] text-lg font-semibold text-[#2a1e0c]">
        {person.name.slice(0, 1)}
      </span>
      <span className="flex-1 text-xl font-medium">{person.name}</span>
      <BeeLogo size={30} glow={false} />
    </m.div>
  );
}

export function BeeTeams() {
  const step = useDeckStep();
  const shared = step >= SHARE;
  const labelled = step >= LABEL;

  return (
    <Shell className="py-14">
      <Title size="md">Better together</Title>

      <Camera shots={SHOTS} className="mt-8">
        <div className="relative" style={{ width: W, height: H }}>
          {PEOPLE.map((person, index) => (
            <PersonCard key={person.name} person={person} index={index} />
          ))}

          {/* Each Bee shares what its own person said. */}
          {PEOPLE.map((person, index) => (
            <m.div
              key={person.name}
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: shared ? 1 : 0 }}
              transition={{ duration: 0.01, delay: shared ? 0.1 : 0 }}
            >
              <Connector
                from={{ x: PERSON.w + 8, y: person.y + PERSON.h / 2 }}
                to={{ x: DOC.x - 10, y: 150 + index * 40 }}
                bend={index === 1 ? 0 : index === 0 ? 30 : -30}
                step={SHARE}
                delay={0.2 + index * 0.15}
                flowPeriod={1.2}
              />
            </m.div>
          ))}

          {/* One summary for the whole team. */}
          <m.div
            className={`${BEE_CARD} absolute flex flex-col gap-5 p-8`}
            style={{ left: DOC.x, top: 30, width: DOC.w }}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: shared ? 1 : 0.4 }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
          >
            <div className="flex items-center gap-3">
              <IconFileText size={22} className="text-[#c27406]" />
              <span className="text-2xl font-semibold text-[#2a1e0c]">
                Team summary
              </span>
            </div>
            {LINES.map((line, index) => (
              <m.div
                key={line.who}
                className="flex items-baseline gap-3 text-xl text-[#2a1e0c]/85"
                initial={{ opacity: 0, y: 10 }}
                animate={shared ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={cueTransition(
                  shared,
                  0.7 + index * 0.15,
                  BEE_SPRING,
                )}
              >
                <m.span
                  className="shrink-0 rounded-full px-3 py-0.5 text-[15px] font-semibold"
                  initial={false}
                  animate={{
                    backgroundColor: labelled
                      ? "rgba(250,190,40,0.32)"
                      : "rgba(42,30,12,0.06)",
                    color: labelled ? "#7a4800" : "rgba(42,30,12,0.3)",
                  }}
                  transition={{
                    duration: DUR.slow,
                    delay: labelled ? 0.15 + index * 0.12 : 0,
                  }}
                >
                  {labelled ? line.who : "?"}
                </m.span>
                {line.text}
              </m.div>
            ))}
          </m.div>

          {/* Why the names are right: every line comes from its own mic. */}
          <m.div
            className="absolute flex items-center gap-3 text-xl font-medium text-[#2a1e0c]"
            style={{ left: DOC.x + 8, top: 330 }}
            initial={{ opacity: 0, y: 12 }}
            animate={labelled ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={cueTransition(labelled, 0.6, BEE_SPRING)}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-[#fabe28]/30 text-[#7a4800]">
              <IconMicrophone size={20} />
            </span>
            Each line comes from that person&apos;s own microphone, so it is
            never a guess.
          </m.div>

          {/* What it takes: Bee running on everyone's laptop. */}
          <m.div
            className="absolute text-[17px] text-[#2a1e0c]/60"
            style={{ left: PERSON.x + 4, top: 416 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: shared ? 1 : 0 }}
            transition={cueTransition(shared, 0.9, { duration: DUR.slow })}
          >
            Everyone runs Bee on their own laptop.
          </m.div>
        </div>
      </Camera>
    </Shell>
  );
}
