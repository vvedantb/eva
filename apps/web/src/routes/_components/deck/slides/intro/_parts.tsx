import { use } from "react";
import type { ReactNode } from "react";
import { cn } from "@eva/ui";
import {
  DeckThemeContext,
  Kicker,
  Reveal,
  Shell,
  Stagger,
  StaggerItem,
  Title,
} from "../../_components/DeckPrimitives";

/**
 * The intro deck is the only one that alternates light and dark surfaces, and
 * the shared primitives are written for the dark stage. Rather than fork the
 * primitives, each intro slide lays these explicit classes over them, picked
 * from whichever theme the deck has put on `DeckThemeContext`.
 */
interface IntroPalette {
  surface: string;
  kicker: string;
  title: string;
  body: string;
  dot: string;
  bullet: string;
  tag: string;
  muted: string;
}

const PALETTES: Record<"dark" | "light", IntroPalette> = {
  dark: {
    surface: "bg-zinc-950",
    kicker: "text-white/45",
    title: "text-white",
    body: "text-white/65",
    dot: "bg-white/35",
    bullet: "text-white/80",
    tag: "bg-white/[0.07] text-white/75",
    muted: "text-white/40",
  },
  light: {
    surface: "bg-zinc-50",
    kicker: "text-zinc-500",
    title: "text-zinc-900",
    body: "text-zinc-600",
    dot: "bg-zinc-400",
    bullet: "text-zinc-700",
    tag: "bg-zinc-900/[0.06] text-zinc-700",
    muted: "text-zinc-400",
  },
};

export function useIntroPalette(): IntroPalette {
  return PALETTES[use(DeckThemeContext)];
}

interface IntroBulletsProps {
  items: readonly string[];
  delayChildren?: number;
}

/**
 * The legacy deck revealed a whole bullet list as one block. Here each line
 * arrives on its own, which is the only motion these slides need.
 */
export function IntroBullets({ items, delayChildren = 0.3 }: IntroBulletsProps) {
  const palette = useIntroPalette();
  return (
    <Stagger
      delayChildren={delayChildren}
      staggerChildren={0.12}
      className="mt-8 space-y-5"
    >
      {items.map((item) => (
        <StaggerItem key={item} className="flex items-start gap-4">
          <span
            className={cn(
              "mt-[0.65em] size-1.5 shrink-0 rounded-full",
              palette.dot,
            )}
          />
          <span className={cn("text-xl leading-relaxed", palette.bullet)}>
            {item}
          </span>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

interface FeatureSlideProps {
  kicker: string;
  title: string;
  bullets: readonly string[];
}

/**
 * Seven of the intro slides are the same shape: a kicker, a headline and three
 * bullets. They keep one file each so they stay easy to diff against the deck
 * they came from, but the layout lives here once.
 */
export function FeatureSlide({ kicker, title, bullets }: FeatureSlideProps) {
  const palette = useIntroPalette();
  return (
    <Shell className={cn("justify-center", palette.surface)}>
      <Reveal>
        <Kicker className={palette.kicker}>{kicker}</Kicker>
      </Reveal>
      <Reveal delay={0.1}>
        <Title className={palette.title}>{title}</Title>
      </Reveal>
      <IntroBullets items={bullets} />
    </Shell>
  );
}

export function IntroTag({ children }: { children: ReactNode }) {
  const palette = useIntroPalette();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium",
        palette.tag,
      )}
    >
      {children}
    </span>
  );
}
