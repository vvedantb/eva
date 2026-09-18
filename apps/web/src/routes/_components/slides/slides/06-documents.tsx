import {
  SlideShell,
  SlideReveal,
  SlideKicker,
  SlideTitle,
  SlideBullets,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

export function Slide06Documents() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>Documents</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.1}>
        <SlideTitle>Structured context</SlideTitle>
      </SlideReveal>
      <SlideStagger step={0} delayChildren={0.3}>
        <SlideItem>
          <SlideBullets
            items={[
              "Attach PRDs, specs, and notes to any session",
              "Markdown editor with live preview",
              "Reference docs from prompts with @-mentions",
            ]}
          />
        </SlideItem>
      </SlideStagger>
    </SlideShell>
  );
}
