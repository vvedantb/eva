import type { Icon } from "@tabler/icons-react";
import {
  IconBolt,
  IconMessageCircle,
  IconListDetails,
} from "@tabler/icons-react";
import { m } from "motion/react";
import {
  Accent,
  EASE_OUT,
  Kicker,
  Reveal,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import { FriChip } from "../_parts/FriMock";

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

function WayCard({ way, index }: { way: Way; index: number }) {
  const step = useDeckStep();
  const landed = step >= index;
  // Earlier cards settle back once a larger one lands, so the newest card is
  // always the brightest thing on the stage.
  const dimmed = index < Math.min(step, WAYS.length - 1);

  return (
    <m.div
      className="flex flex-col justify-between rounded-[24px] bg-white/[0.05] p-7 ring-1 ring-white/[0.06]"
      style={{ width: way.width, height: way.height }}
      initial={{ opacity: 0, y: 30, scale: 0.94 }}
      animate={{
        opacity: landed ? (dimmed ? 0.55 : 1) : 0,
        y: landed ? 0 : 30,
        scale: landed ? 1 : 0.94,
      }}
      transition={
        landed
          ? { type: "spring", bounce: 0, duration: 0.6 }
          : { duration: 0.25, ease: EASE_OUT }
      }
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
      <div>
        <div className="text-3xl leading-tight font-semibold text-balance text-white">
          {way.name}
        </div>
        <div className="mt-3 text-sm text-white/50">{way.label}</div>
      </div>
    </m.div>
  );
}

export function FridayThreeWays() {
  return (
    <Shell className="py-14">
      <Reveal>
        <Kicker>Ways to ask</Kicker>
        <Title size="md">Three sizes of ask.</Title>
      </Reveal>

      <div className="mt-8 flex items-end gap-6">
        {WAYS.map((way, index) => (
          <WayCard key={way.name} way={way} index={index} />
        ))}
      </div>

      <Reveal step={3} className="mt-10">
        <p className="text-3xl text-pretty text-white/85">
          Same engine. <Accent>Different size of job.</Accent>
        </p>
      </Reveal>
    </Shell>
  );
}
