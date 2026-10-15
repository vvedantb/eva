import type { ReactNode } from "react";
import { BRAND, BRAND_GRADIENT } from "../../_components/motion";

export interface MoA3Tile {
  id: string;
  node: ReactNode;
}

const SWATCH = "size-9 rounded-[10px]";

/**
 * The design-system slide's library in miniature (d02): four colours, four
 * surface tones and four of the shapes every screen is built from, each drawn
 * as the real control rather than a grey block. No labels — the point is that
 * it is one set, not twelve separate decisions.
 */
export const MOA3_TILES: readonly MoA3Tile[] = [
  {
    id: "purple",
    node: <div className={SWATCH} style={{ background: BRAND.purple }} />,
  },
  {
    id: "blue",
    node: <div className={SWATCH} style={{ background: BRAND.blue }} />,
  },
  {
    id: "gradient",
    node: <div className={SWATCH} style={{ background: BRAND_GRADIENT }} />,
  },
  {
    id: "raised",
    node: (
      <div className="relative size-10">
        <div className="absolute top-0 left-0 size-8 rounded-[9px] bg-white/12" />
        <div className="absolute right-0 bottom-0 size-8 rounded-[9px] bg-white/30" />
      </div>
    ),
  },
  {
    id: "button",
    node: (
      <div
        className="flex h-8 w-[84px] items-center justify-center rounded-full"
        style={{ background: BRAND_GRADIENT }}
      >
        <div className="h-1.5 w-9 rounded-full bg-white/85" />
      </div>
    ),
  },
  {
    id: "field",
    node: (
      <div className="flex h-8 w-[92px] items-center gap-1.5 rounded-[8px] bg-white/10 px-2.5 ring-1 ring-white/15">
        <div className="h-4 w-px bg-white/80" />
        <div className="h-1.5 w-10 rounded-full bg-white/20" />
      </div>
    ),
  },
  {
    id: "avatar",
    node: (
      <div className="flex -space-x-2.5">
        <div
          className="size-9 rounded-full p-[2px]"
          style={{ background: BRAND_GRADIENT }}
        >
          <div className="size-full rounded-full bg-[#2a2536]" />
        </div>
        <div className="size-9 rounded-full bg-white/20 ring-2 ring-[#1c1a22]" />
      </div>
    ),
  },
  {
    id: "badge",
    node: (
      <div className="flex h-6 items-center gap-1.5 rounded-full bg-white/12 px-2.5">
        <div
          className="size-1.5 rounded-full"
          style={{ background: BRAND.blue }}
        />
        <div className="h-1.5 w-7 rounded-full bg-white/40" />
      </div>
    ),
  },
  {
    id: "toggle",
    node: (
      <div
        className="flex h-6 w-11 items-center justify-end rounded-full px-1"
        style={{ background: BRAND_GRADIENT }}
      >
        <div className="size-4 rounded-full bg-white" />
      </div>
    ),
  },
  {
    id: "lines",
    node: (
      <div className="flex w-[80px] flex-col gap-1.5">
        <div className="h-2 w-3/4 rounded-full bg-white/40" />
        <div className="h-1.5 rounded-full bg-white/15" />
        <div className="h-1.5 w-2/3 rounded-full bg-white/15" />
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
