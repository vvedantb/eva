import {
  SlideShell,
  SlideReveal,
  SlideKicker,
  SlideTitle,
  SlideStagger,
  SlideItem,
  SlideTag,
} from "../_components/SlideShell";

export function Slide08Stack() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>Tech Stack</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.1}>
        <SlideTitle size="xl">Built on proven foundations</SlideTitle>
      </SlideReveal>
      <SlideStagger step={0} delayChildren={0.3} className="mt-10 flex flex-wrap gap-3">
        <SlideItem>
          <SlideTag>React</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>Vite</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>Convex</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>TailwindCSS</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>Clerk</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>GitHub App</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>Vercel Sandboxes</SlideTag>
        </SlideItem>
        <SlideItem>
          <SlideTag>TypeScript</SlideTag>
        </SlideItem>
      </SlideStagger>
    </SlideShell>
  );
}
