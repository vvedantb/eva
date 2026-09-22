import { FeatureSlide } from "./_parts";

export function IntroProjects() {
  return (
    <FeatureSlide
      kicker="Projects"
      title="Organize your work"
      bullets={[
        "Group tasks, sessions, and documents by project",
        "Per-project settings and credentials",
        "Team visibility and collaboration",
      ]}
    />
  );
}
