import { FeatureSlide } from "./_parts";

export function IntroDocuments() {
  return (
    <FeatureSlide
      kicker="Documents"
      title="Structured context"
      bullets={[
        "Attach PRDs, specs, and notes to any session",
        "Markdown editor with live preview",
        "Reference docs from prompts with @-mentions",
      ]}
    />
  );
}
