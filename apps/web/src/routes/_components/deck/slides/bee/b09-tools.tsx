import type { ReactNode } from "react";
import { IconPlug } from "@tabler/icons-react";
import { m } from "motion/react";
import { Shell, useDeckStep } from "../../_components/DeckPrimitives";
import { Camera } from "../../_components/DeckCamera";
import type { CameraShot } from "../../_components/DeckCamera";
import { Connector, Spotlight, cueTransition } from "../../_components/motion";
import { BEE, BEE_SPRING } from "./_parts/BeeIsland";
import { BeeLogo } from "./_parts/BeeLogo";
import { BEE_CARD } from "./_parts/BeeBits";
import { VmemMark } from "./_parts/VmemMark";
import { EvaDiscMark } from "../../_components/EvaDiscMark";

const CONNECT = 1;
const CONTEXT = 2;

const W = 1088;
const H = 440;
const HUB = { x: W / 2, y: 200 };

interface Tool {
  /** The 44px tile: a real logo where the product has one. */
  tile: ReactNode;
  label: string;
  note: string;
  step: number;
  x: number;
  y: number;
}

const TOOLS: readonly Tool[] = [
  {
    tile: <EvaDiscMark size={44} />,
    label: "Eva",
    note: "Your team's work",
    step: CONNECT,
    x: 60,
    y: 40,
  },
  {
    tile: (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#17140f] text-[#fff]">
        <VmemMark size={24} />
      </span>
    ),
    label: "vmem",
    note: "Your history",
    step: CONNECT,
    x: 60,
    y: 250,
  },
  {
    tile: (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fabe28]/25 text-[#a15f00]">
        <IconPlug size={22} stroke={1.7} />
      </span>
    ),
    label: "Your own",
    note: "Any connector",
    step: CONNECT,
    x: 800,
    y: 40,
  },
  {
    tile: <BrandTile src="/brands/microsoft-outlook.svg" alt="Outlook" />,
    label: "Outlook",
    note: "Which meeting",
    step: CONTEXT,
    x: 800,
    y: 250,
  },
  {
    tile: <BrandTile src="/brands/microsoft-teams.svg" alt="Microsoft Teams" />,
    label: "Teams",
    note: "Who is in it",
    step: CONTEXT,
    x: 430,
    y: 340,
  },
];

/** A product logo from `public/brands`, on a plain white tile. */
function BrandTile({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff] ring-1 ring-[#2a1e0c]/10">
      <img src={src} alt={alt} className="size-7" />
    </span>
  );
}

const CARD = { w: 228, h: 80 };

const SHOTS: readonly CameraShot[] = [
  { rotateX: 8, translateZ: -40 },
  { rotateX: 4 },
  { rotateX: 2, translateZ: -20 },
];

const GLOW = [
  { x: HUB.x, y: HUB.y, size: 360 },
  { x: HUB.x, y: HUB.y, size: 560 },
  { x: HUB.x, y: HUB.y + 60, size: 640 },
];

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
  const shown = useDeckStep() >= tool.step;
  return (
    <m.div
      className={`${BEE_CARD} absolute flex items-center gap-4 px-5`}
      style={{ left: tool.x, top: tool.y, width: CARD.w, height: CARD.h }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
      transition={cueTransition(shown, 0.25 + (index % 3) * 0.12, BEE_SPRING)}
    >
      {tool.tile}
      <span>
        <span className="block text-xl font-semibold text-[#2a1e0c]">
          {tool.label}
        </span>
        <span className="block text-[15px] text-[#2a1e0c]/55">{tool.note}</span>
      </span>
    </m.div>
  );
}

export function BeeTools() {
  const connected = useDeckStep() >= CONNECT;
  return (
    <Shell className="justify-center py-14">
      <Camera shots={SHOTS}>
        <div className="relative isolate" style={{ width: W, height: H }}>
          <Spotlight shots={GLOW} className="-inset-16 overflow-visible" />

          {TOOLS.map((tool) => {
            const end = {
              x: tool.x < HUB.x ? tool.x + CARD.w + 6 : tool.x - 6,
              y: tool.y + CARD.h / 2,
            };
            const isBelow = tool.y > HUB.y + 100;
            return (
              <Connector
                key={tool.label}
                from={{ x: HUB.x, y: HUB.y + (isBelow ? 50 : 0) }}
                to={isBelow ? { x: tool.x + CARD.w / 2, y: tool.y - 6 } : end}
                bend={tool.x < HUB.x ? -40 : 40}
                step={tool.step}
                delay={0.1}
                flowPeriod={1.4}
              />
            );
          })}

          {/* Bee in the middle. */}
          <m.div
            className="absolute flex size-[132px] items-center justify-center rounded-[36px]"
            style={{
              left: HUB.x - 66,
              top: HUB.y - 66,
              background: BEE.surface,
            }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...BEE_SPRING, delay: 0.2 }}
          >
            <BeeLogo
              size={92}
              tone="dark"
              glow={false}
              state={connected ? "tool" : "idle"}
            />
          </m.div>

          {TOOLS.map((tool, index) => (
            <ToolCard key={tool.label} tool={tool} index={index} />
          ))}
        </div>
      </Camera>
    </Shell>
  );
}
