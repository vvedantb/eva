import { FeatureSlide } from "./_parts";

export function IntroSandboxes() {
  return (
    <FeatureSlide
      kicker="Sandboxes"
      title="Isolated execution"
      bullets={[
        "Vercel-powered sandboxes for every task",
        "Full Linux environment with shell access",
        "Safe to experiment — nothing touches prod",
      ]}
    />
  );
}
