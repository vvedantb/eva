import {
  SlideShell,
  SlideReveal,
  SlideKicker,
  SlideTitle,
  SlideBullets,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

export function Slide05Projects() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>Projects</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.1}>
        <SlideTitle>Organize your work</SlideTitle>
      </SlideReveal>
      <SlideStagger step={0} delayChildren={0.3}>
        <SlideItem>
          <SlideBullets
            items={[
              "Group tasks, sessions, and documents by project",
              "Per-project settings and credentials",
              "Team visibility and collaboration",
            ]}
          />
        </SlideItem>
      </SlideStagger>
    </SlideShell>
  );
}
