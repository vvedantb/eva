import { FeatureSlide } from "./_parts";

export function IntroPrs() {
  return (
    <FeatureSlide
      kicker="Pull Requests"
      title="Ship without friction"
      bullets={[
        "One-click PR creation from any task",
        "Automatic branch naming and commit messages",
        "Review diffs, CI status, and merge — all in Eva",
      ]}
    />
  );
}
