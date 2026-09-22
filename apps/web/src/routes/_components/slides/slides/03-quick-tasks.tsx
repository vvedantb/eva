import {
  SlideShell,
  SlideReveal,
  SlideKicker,
  SlideTitle,
  SlideBullets,
  SlideStagger,
  SlideItem,
} from "../_components/SlideShell";

export function Slide03QuickTasks() {
  return (
    <SlideShell className="bg-background">
      <SlideReveal>
        <SlideKicker>Quick Tasks</SlideKicker>
      </SlideReveal>
      <SlideReveal delay={0.1}>
        <SlideTitle>Fire-and-forget prompts</SlideTitle>
      </SlideReveal>
      <SlideStagger step={0} delayChildren={0.3}>
        <SlideItem>
          <SlideBullets
            items={[
              "Write a prompt, Eva spins up a sandboxed agent",
              "No context switching — return when it's done",
              "Perfect for small refactors, docs, and experiments",
            ]}
          />
        </SlideItem>
      </SlideStagger>
    </SlideShell>
  );
}
