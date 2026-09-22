import { FeatureSlide } from "./_parts";

export function IntroGitHub() {
  return (
    <FeatureSlide
      kicker="GitHub Integration"
      title="Native GitHub flow"
      bullets={[
        "GitHub App for secure repo access",
        "Clone, branch, commit, push — all automated",
        "Works with any GitHub org or personal account",
      ]}
    />
  );
}
