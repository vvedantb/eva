#!/usr/bin/env bash
# Build a signed, sideloadable Eva Android release APK (arm64-v8a only, since
# @vvedantb/config 0.12.0 dropped x86_64 for release APKs; embedded JS), then
# write release.json next to it. No EAS.
#
# Thin wrapper over the shared vvedantb-android-release bin, driven by
# scripts/android-release.config.json. The build logic lives in @vvedantb/config;
# the Clerk native-API check runs in the workflow pre_build_command.
#
# VERSION_NAME and VERSION_CODE come from the environment
# (.github/workflows/release-android.yml chooses both). Signing and the
# EXPO_PUBLIC_* runtime config also come from the environment. Linux CI only.
#
# Optional wait: with WAIT_FOR_CI_CHECK=1 (set by release-android-ci.yml on a push
# to main), the script waits after the build for the Check job of the same
# workflow run. The build runs in parallel with Check. If Check does not succeed,
# the script exits non-zero, so the shared workflow never runs its Publish step.
# Manual release-android.yml runs leave it unset and do not wait.
set -euo pipefail
# The reusable workflow does not install dependencies, and the bin below comes
# from @vvedantb/config, so install first.
pnpm install --frozen-lockfile --filter '@eva/mobile...' --filter '{.}'
pnpm exec vvedantb-android-release --config scripts/android-release.config.json

[ "${WAIT_FOR_CI_CHECK:-}" = "1" ] || exit 0

# Wait for the Check job of this workflow run. Reusable-workflow jobs are named
# "<caller job> / <job name>", so Check is "check / Check".
if [ -z "${GITHUB_RUN_ID:-}" ] || [ -z "${GITHUB_REPOSITORY:-}" ]; then
  echo "::error::WAIT_FOR_CI_CHECK=1 needs GITHUB_RUN_ID and GITHUB_REPOSITORY."
  exit 1
fi
poll_seconds=15
deadline=$((SECONDS + 45 * 60))
echo "APK built. Waiting for the Check job of run $GITHUB_RUN_ID before publish."
while true; do
  # --paginate emits one JSON document per page, and jq filters each page.
  state="$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/jobs?per_page=100" \
    --jq '.jobs[] | select(.name == "Check" or (.name | endswith(" / Check"))) | "\(.status) \(.conclusion // "none")"' \
    | head -n 1)" || state=""
  case "$state" in
    "completed success")
      echo "Check succeeded. Publish can run."
      exit 0
      ;;
    completed*)
      echo "::error::Check finished with conclusion '${state#completed }'. Not publishing."
      exit 1
      ;;
  esac
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "::error::Timed out after 45 minutes waiting for the Check job. Not publishing."
    exit 1
  fi
  echo "Check state: ${state:-not found yet}. Next poll in ${poll_seconds}s."
  sleep "$poll_seconds"
done
