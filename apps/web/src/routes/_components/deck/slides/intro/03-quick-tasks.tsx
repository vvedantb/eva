import { FeatureSlide } from "./_parts";

export function IntroQuickTasks() {
  return (
    <FeatureSlide
      kicker="Quick Tasks"
      title="Fire-and-forget prompts"
      bullets={[
        "Write a prompt, Eva spins up a sandboxed agent",
        "No context switching — return when it's done",
        "Perfect for small refactors, docs, and experiments",
      ]}
    />
  );
}
