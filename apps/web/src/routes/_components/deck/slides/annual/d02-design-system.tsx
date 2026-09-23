import type { ReactNode } from "react";
import { CountUp } from "../../_components/CountUp";
import {
  Accent,
  BRAND,
  Footnote,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

const GRADIENT = `linear-gradient(90deg, ${BRAND.purple}, ${BRAND.blue})`;

interface Tile {
  id: string;
  node: ReactNode;
}

/**
 * The library in miniature: four colours, four surface tones and four of the
 * shapes every screen is built from. No labels — the point is that it is one
 * set, not twelve separate decisions.
 */
const TILES: readonly Tile[] = [
  {
    id: "purple",
    node: (
      <div
        className="size-9 rounded-[10px]"
        style={{ background: BRAND.purple }}
      />
    ),
  },
  {
    id: "blue",
    node: (
      <div
        className="size-9 rounded-[10px]"
        style={{ background: BRAND.blue }}
      />
    ),
  },
  {
    id: "gradient",
    node: (
      <div className="size-9 rounded-[10px]" style={{ background: GRADIENT }} />
    ),
  },
  { id: "raised", node: <div className="size-9 rounded-[10px] bg-white/25" /> },
  {
    id: "button",
    node: (
      <div
        className="h-7 w-[72px] rounded-full"
        style={{ background: GRADIENT }}
      />
    ),
  },
  {
    id: "field",
    node: <div className="h-7 w-[72px] rounded-[8px] bg-white/12" />,
  },
  { id: "avatar", node: <div className="size-9 rounded-full bg-white/20" /> },
  {
    id: "badge",
    node: <div className="h-5 w-[52px] rounded-full bg-white/15" />,
  },
  {
    id: "toggle",
    node: (
      <div className="flex h-6 w-11 items-center rounded-full bg-white/15 px-1">
        <div className="size-4 rounded-full bg-white/80" />
      </div>
    ),
  },
  {
    id: "lines",
    node: (
      <div className="flex w-[76px] flex-col gap-2">
        <div className="h-2 rounded-full bg-white/25" />
        <div className="h-2 w-2/3 rounded-full bg-white/12" />
      </div>
    ),
  },
  {
    id: "tone-low",
    node: <div className="size-9 rounded-[10px] bg-white/[0.08]" />,
  },
  {
    id: "tone-high",
    node: (
      <div className="size-9 rounded-[10px] border border-white/25 bg-white/[0.02]" />
    ),
  },
];

const FIGURE = "text-6xl leading-none font-semibold tabular-nums";

export function AnnualDesignSystem() {
  return (
    <Shell className="py-12">
      <Reveal>
        <Kicker>Design system</Kicker>
        <Title size="md">One visual language.</Title>
      </Reveal>

      <Stagger
        delayChildren={0.35}
        staggerChildren={0.055}
        className="mt-9 grid grid-cols-6 gap-4"
      >
        {TILES.map((tile) => (
          <StaggerItem
            key={tile.id}
            className="flex h-[72px] items-center justify-center rounded-[14px] bg-white/[0.05]"
          >
            {tile.node}
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal step={1} className="mt-11 flex justify-center gap-28">
        <div className="text-center">
          <div className={FIGURE}>
            <Accent>
              <CountUp value={110} step={1} delay={0.3} duration={1.3} />
            </Accent>
          </div>
          <div className="mt-4 text-base text-white/50">shared components</div>
        </div>
        <div className="text-center">
          <div className={FIGURE}>
            <Accent>
              <CountUp value={18197} step={1} delay={0.3} duration={1.6} />
            </Accent>
          </div>
          <div className="mt-4 text-base text-white/50">lines behind them</div>
        </div>
      </Reveal>

      <Reveal step={2} className="mt-11 text-center">
        <p className="text-3xl text-white/85">
          Every new screen <Accent>starts consistent</Accent>.
        </p>
      </Reveal>

      <Footnote>Measured 23 September 2026.</Footnote>
    </Shell>
  );
}
