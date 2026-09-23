import type { Icon } from "@tabler/icons-react";
import {
  IconCheck,
  IconFolders,
  IconListCheck,
  IconMessageCircle,
  IconRobot,
} from "@tabler/icons-react";
import { m } from "motion/react";
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

interface Node {
  icon: Icon;
  label: string;
  /** Vertical centre inside the 300px diagram. */
  y: number;
  /** True for the two that come back finished on the last step. */
  reports?: boolean;
}

const NODES: readonly Node[] = [
  { icon: IconRobot, label: "Session", y: 25 },
  { icon: IconListCheck, label: "Quick task", y: 75, reports: true },
  { icon: IconRobot, label: "Session", y: 125 },
  { icon: IconFolders, label: "Project", y: 175 },
  { icon: IconListCheck, label: "Quick task", y: 225, reports: true },
  { icon: IconRobot, label: "Session", y: 275 },
];

/** Where the lines leave the hub and where they meet a node. */
const HUB_X = 200;
const NODE_X = 620;
const HUB_Y = 150;
const LINE_STAGGER = 0.09;

function path(y: number): string {
  return `M ${HUB_X} ${HUB_Y} C 390 ${HUB_Y}, 430 ${y}, ${NODE_X} ${y}`;
}

export function FridayAve() {
  const step = useDeckStep();
  const wired = step >= 1;
  const reported = step >= 2;

  return (
    <Shell className="py-12">
      <Kicker>Manager Ave</Kicker>
      <Title size="md">
        One chat that <Accent>runs the others</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        It supervises. It does not write the code.
      </Body>

      <div className="relative mt-8 h-[300px] w-[1000px]">
        <svg
          viewBox="0 0 1000 300"
          className="absolute inset-0"
          aria-hidden
          role="presentation"
        >
          <defs>
            <linearGradient id="fri2-wire" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={BRAND.purple} />
              <stop offset="100%" stopColor={BRAND.blue} />
            </linearGradient>
          </defs>
          {NODES.map((node, index) => (
            <m.path
              key={`${node.label}-${node.y}`}
              d={path(node.y)}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: wired ? 1 : 0,
                stroke:
                  reported && node.reports ? "#34d399" : "url(#fri2-wire)",
              }}
              transition={{
                pathLength: {
                  duration: 0.7,
                  ease: EASE_OUT,
                  delay: wired ? index * LINE_STAGGER : 0,
                },
                stroke: { duration: 0.45, ease: EASE_OUT },
              }}
            />
          ))}
        </svg>

        <div className="absolute top-[85px] left-0 flex h-[130px] w-[195px] flex-col justify-between rounded-[22px] bg-white/[0.07] p-5 ring-1 ring-white/10">
          <IconMessageCircle
            size={26}
            stroke={1.6}
            aria-hidden
            className="text-white/75"
          />
          <div className="text-lg leading-tight font-semibold text-white">
            Manager Ave
          </div>
        </div>

        {NODES.map((node, index) => (
          <m.div
            key={`${node.label}-${node.y}`}
            className="absolute flex h-11 w-[340px] items-center gap-3 rounded-full bg-white/[0.06] px-5 ring-1 ring-white/[0.08]"
            style={{ left: NODE_X, top: node.y - 22 }}
            initial={{ opacity: 0, x: -16 }}
            animate={wired ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
            transition={{
              type: "spring",
              bounce: 0,
              duration: 0.55,
              delay: wired ? 0.35 + index * LINE_STAGGER : 0,
            }}
          >
            <node.icon
              size={17}
              stroke={1.6}
              aria-hidden
              className="text-white/55"
            />
            <span className="flex-1 text-sm text-white/85">{node.label}</span>
            <m.span
              className="flex size-6 items-center justify-center rounded-full bg-emerald-400/20"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={
                reported && node.reports
                  ? { opacity: 1, scale: 1 }
                  : { opacity: 0, scale: 0.5 }
              }
              transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
            >
              <IconCheck
                size={14}
                stroke={2.4}
                aria-hidden
                className="text-emerald-300"
              />
            </m.span>
          </m.div>
        ))}
      </div>

      <Footnote>
        The master chat landed 18 August 2026. It became Manager Ave, limited to
        supervising, on 24 August 2026.
      </Footnote>
    </Shell>
  );
}
