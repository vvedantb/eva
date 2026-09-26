import type { Icon } from "@tabler/icons-react";
import {
  IconBolt,
  IconMessageCircle,
  IconListDetails,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  DUR,
  EASE,
  LEAVE,
  MaskedText,
  SETTLE,
  Sheen,
} from "../../_components/motion";
import { FriChip } from "../_parts/FriMock";
import { MoF1WayScene } from "../_parts/MoF1WayScene";

interface Way {
  size: string;
  name: string;
  label: string;
  glyph: Icon;
  width: number;
  height: number;
}

/** Smallest ask first, each card a little larger than the one before it. */
const WAYS: readonly Way[] = [
  {
    size: "Small",
    name: "Quick task",
    label: "One job, start to finish",
    glyph: IconBolt,
    width: 290,
    height: 210,
  },
  {
    size: "Medium",
    name: "Session",
    label: "A running conversation",
    glyph: IconMessageCircle,
    width: 330,
    height: 250,
  },
  {
    size: "Large",
    name: "Project",
    label: "Several jobs, in order",
    glyph: IconListDetails,
    width: 370,
    height: 292,
  },
];

const CLOSING_STEP = WAYS.length;

/** The newest card leads; on the closing line all three stand level. */
function useFocus(index: number): {
  opacity: number;
  scale: number;
  y: number;
} {
  const step = useDeckStep();
  if (step >= CLOSING_STEP) return { opacity: 1, scale: 1, y: 0 };
  if (index === step) return { opacity: 1, scale: 1.03, y: -6 };
  return { opacity: 0.5, scale: 0.98, y: 0 };
}

function WayCard({ way, index }: { way: Way; index: number }) {
  const landed = useDeckStep() >= index;
  const focus = useFocus(index);

  return (
    <m.div className="origin-bottom" animate={focus} transition={SETTLE}>
      <m.div
        initial={{ opacity: 0, y: 44, scale: 0.9 }}
        animate={
          landed
            ? { opacity: 1, y: 0, scale: 1 }
            : { opacity: 0, y: 44, scale: 0.9 }
        }
        transition={
          landed
            ? {
                duration: DUR.hero,
                ease: EASE.expo,
                opacity: { duration: DUR.base },
              }
            : LEAVE
        }
      >
        {/* One band crosses all three on the closing line: one engine. */}
        <Sheen
          step={CLOSING_STEP}
          delay={0.35 + index * 0.14}
          duration={0.9}
          className="rounded-[24px]"
        >
          <Sheen step={index} delay={0.5} className="rounded-[24px]">
            <div
              className="flex flex-col rounded-[24px] bg-white/[0.05] p-7 ring-1 ring-white/[0.06]"
              style={{ width: way.width, height: way.height }}
            >
              <div className="flex items-center justify-between">
                <way.glyph
                  size={24}
                  stroke={1.6}
                  className="text-white/60"
                  aria-hidden
                />
                <FriChip>{way.size}</FriChip>
              </div>
              <div className="flex flex-1 items-center">
                <MoF1WayScene kind={index} step={index} />
              </div>
              <div>
                <div className="text-3xl leading-tight font-semibold text-balance text-white">
                  <MaskedText step={index} delay={0.25}>
                    {way.name}
                  </MaskedText>
                </div>
                <MaskedText
                  step={index}
                  delay={0.4}
                  stagger={0.04}
                  duration={DUR.slow}
                  className="mt-3 block text-sm text-white/50"
                >
                  {way.label}
                </MaskedText>
              </div>
            </div>
          </Sheen>
        </Sheen>
      </m.div>
    </m.div>
  );
}

export function FridayThreeWays() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Using Eva · Three sizes</Kicker>
        <Title size="md">Three sizes of ask.</Title>
      </Reveal>

      <div className="mt-8 flex items-end gap-6">
        {WAYS.map((way, index) => (
          <WayCard key={way.name} way={way} index={index} />
        ))}
      </div>

      <p className="mt-10 text-3xl text-pretty text-white/85">
        <MaskedText step={CLOSING_STEP} delay={0.1}>
          Pick by the job, <Accent>not by the person.</Accent>
        </MaskedText>
      </p>
    </Shell>
  );
}
