import { FeatureSlide } from "./_parts";

export function IntroSessions() {
  return (
    <FeatureSlide
      kicker="Sessions"
      title="Persistent pair-programming"
      bullets={[
        "Agent session that survives page reloads",
        "Talk, iterate, branch, revert — full conversation history",
        "Desktop-quality experience in the browser",
      ]}
    />
  );
}
