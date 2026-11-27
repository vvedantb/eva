import { cn } from "@eva/ui";

/**
 * Third-party brands named on the marketing page.
 *
 * The union is closed so `BRAND_MARKS` can be an exhaustive record — naming a
 * brand we have not shipped a mark for is then a type error rather than a
 * broken image on the live page.
 */
export type BrandName =
  | "claude"
  | "openai"
  | "opencode"
  | "cursor"
  | "vite"
  | "tanstack"
  | "react"
  | "tailwind"
  | "convex"
  | "vercel"
  | "clerk";

interface BrandMarkAsset {
  /** Path under `apps/web/public/brands`. */
  src: string;
  /**
   * Dark-mode variant, set only where the light mark is near-black or its brand
   * colour is too dark to read on a dark surface. The rest carry brand colours
   * that work on either surface, so they ship as a single file.
   */
  darkSrc?: string;
}

/**
 * Marks are the unmodified SVGs from svgl (https://svgl.app), served from
 * `public/brands` rather than inlined: each one keeps its own `id`s and
 * `<style>` scoped to its own document, so nothing collides when several are on
 * the page, and none of the path data lands in the JS bundle.
 */
const BRAND_MARKS: Record<BrandName, BrandMarkAsset> = {
  claude: { src: "/brands/claude.svg" },
  openai: { src: "/brands/openai.svg", darkSrc: "/brands/openai-dark.svg" },
  opencode: {
    src: "/brands/opencode.svg",
    darkSrc: "/brands/opencode-dark.svg",
  },
  cursor: { src: "/brands/cursor.svg", darkSrc: "/brands/cursor-dark.svg" },
  vite: { src: "/brands/vite.svg" },
  tanstack: { src: "/brands/tanstack.svg" },
  react: { src: "/brands/react.svg", darkSrc: "/brands/react-dark.svg" },
  tailwind: { src: "/brands/tailwind.svg" },
  convex: { src: "/brands/convex.svg" },
  vercel: { src: "/brands/vercel.svg", darkSrc: "/brands/vercel-dark.svg" },
  clerk: { src: "/brands/clerk.svg" },
};

/**
 * A brand logo, sized to a square box.
 *
 * Always decorative: every call site writes the brand's name next to the mark,
 * so repeating it as alt text would just make a screen reader say it twice.
 * `object-contain` keeps the non-square marks (Vercel's triangle, Tailwind's
 * wordmark glyph) from being stretched into the box.
 */
export function BrandMark({
  name,
  size = 16,
  className,
}: {
  name: BrandName;
  size?: number;
  className?: string;
}) {
  const mark = BRAND_MARKS[name];
  const shared = {
    alt: "",
    width: size,
    height: size,
    loading: "lazy",
    decoding: "async",
    "aria-hidden": true,
  } as const;

  if (mark.darkSrc === undefined) {
    return (
      <img
        {...shared}
        src={mark.src}
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }

  return (
    <>
      <img
        {...shared}
        src={mark.src}
        className={cn("shrink-0 object-contain dark:hidden", className)}
      />
      <img
        {...shared}
        src={mark.darkSrc}
        className={cn("hidden shrink-0 object-contain dark:block", className)}
      />
    </>
  );
}
