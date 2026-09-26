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
  Body,
  Footnote,
  Kicker,
  Shell,
  Title,
  useDeckStep,
} from "../../_components/DeckPrimitives";
import {
  BRAND,
  DUR,
  DrawPath,
  EASE,
  GridBackdrop,
  MaskedText,
  Pulse,
  SETTLE,
  Sheen,
  cueTransition,
} from "../../_components/motion";

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
const W = 1000;
const H = 300;
const LINE_STAGGER = 0.09;
const DRAW = 0.9;
const DONE = "#34d399";

const out = (y: number) =>
  `M ${HUB_X} ${HUB_Y} C 390 ${HUB_Y}, 430 ${y}, ${NODE_X} ${y}`;
const back = (y: number) =>
  `M ${NODE_X} ${y} C 430 ${y}, 390 ${HUB_Y}, ${HUB_X} ${HUB_Y}`;

/** The order the two finished jobs report in, for their share of the stagger. */
const REPORT_ORDER = NODES.filter((node) => node.reports);

function NodePill({ node, index }: { node: Node; index: number }) {
  const step = useDeckStep();
  const wired = step >= 1;
  const done = step >= 2 && node.reports === true;
  const order = REPORT_ORDER.indexOf(node);

  return (
    <m.div
      className="absolute flex h-11 w-[340px] items-center gap-3 overflow-hidden rounded-full bg-white/[0.06] px-5 ring-1 ring-white/[0.08]"
      style={{ left: NODE_X, top: node.y - 22 }}
      initial={{ opacity: 0, x: -16 }}
      animate={wired ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      transition={cueTransition(wired, DRAW * 0.7 + index * LINE_STAGGER, {
        duration: DUR.slow,
        ease: EASE.expo,
      })}
    >
      <m.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-emerald-400/[0.09] ring-1 ring-emerald-300/30 ring-inset"
        initial={{ opacity: 0 }}
        animate={{ opacity: done ? 1 : 0 }}
        transition={cueTransition(done, order * 0.18, {
          duration: DUR.slow,
          ease: EASE.out,
        })}
      />
      <node.icon
        size={17}
        stroke={1.6}
        aria-hidden
        className="relative text-white/55"
      />
      <span className="relative flex-1 text-sm text-white/85">
        {node.label}
      </span>
      <m.span
        className="relative flex size-6 items-center justify-center rounded-full bg-emerald-400/20"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={done ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
        transition={cueTransition(done, order * 0.18, SETTLE)}
      >
        <IconCheck
          size={14}
          stroke={2.4}
          aria-hidden
          className="text-emerald-300"
        />
      </m.span>
    </m.div>
  );
}

export function FridayAve() {
  return (
    <Shell className="py-12">
      <Kicker>On its own · Manager Ave</Kicker>
      <Title size="md">
        One chat that <Accent>runs the others</Accent>.
      </Title>
      <Body className="mt-4 max-w-3xl">
        <MaskedText delay={0.45} duration={0.8}>
          It supervises. It does not write the code.
        </MaskedText>
      </Body>

      <div className="relative isolate mt-10" style={{ width: W, height: H }}>
        <GridBackdrop
          variant="dots"
          cell={26}
          period={10}
          className="-inset-8"
        />

        {/* Out: each wire draws from the hub with a light riding its tip. */}
        {NODES.map((node, index) => (
          <div key={`out-${node.y}`} className="absolute inset-0">
            <DrawPath
              d={out(node.y)}
              width={W}
              height={H}
              step={1}
              delay={index * LINE_STAGGER}
              duration={DRAW}
              dot
            />
          </div>
        ))}

        {/* Back: the two finished jobs send a green light home. */}
        {REPORT_ORDER.map((node, order) => (
          <div key={`back-${node.y}`} className="absolute inset-0">
            <DrawPath
              d={back(node.y)}
              width={W}
              height={H}
              step={2}
              delay={0.3 + order * 0.18}
              duration={0.8}
              color={DONE}
              dot
            />
          </div>
        ))}

        <m.div
          className="absolute top-[85px] left-0 h-[130px] w-[195px]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.hero, ease: EASE.expo, delay: 0.5 }}
        >
          <Sheen step={2} delay={1.05} className="h-full rounded-[22px]">
            <div className="flex h-full flex-col justify-between rounded-[22px] bg-white/[0.07] p-5 ring-1 ring-white/10 ring-inset">
              <div className="flex items-start justify-between">
                <IconMessageCircle
                  size={26}
                  stroke={1.6}
                  aria-hidden
                  className="text-white/75"
                />
                <Pulse color={BRAND.blue} size={8} delay={0.9} />
              </div>
              <div className="text-lg leading-tight font-semibold text-white">
                Manager Ave
              </div>
            </div>
          </Sheen>
        </m.div>

        {NODES.map((node, index) => (
          <NodePill key={`${node.label}-${node.y}`} node={node} index={index} />
        ))}
      </div>

      <Footnote>
        The master chat landed 18 August 2026. It became Manager Ave, limited to
        supervising, on 24 August 2026.
      </Footnote>
    </Shell>
  );
}
