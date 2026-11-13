#!/usr/bin/env bash
# Installed APKs keep the code they were built with, and the app has no
# over-the-air updates. A backend change that renames or narrows a function
# the phone calls breaks every phone that has not updated yet (0.1.33 after
# #1266/#1267). This type-checks the newest published APK's phone and shared
# code (tag `eva-apk-*`) against this checkout's backend, and fails on any
# error. It runs only when the backend changed against the base branch.
#
#   BASE_REF  the branch to diff against (default origin/main)
#   APK_TAG   check this release instead of the newest (for example eva-apk-0.1.33)
set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
if [ -z "${APK_TAG:-}" ] && git diff --quiet "$BASE_REF"...HEAD -- packages/backend/convex packages/backend/index.ts; then
  echo "check-apk-compat: no backend change against $BASE_REF; skipped."
  exit 0
fi

TAG="${APK_TAG:-$(git tag -l 'eva-apk-*' | sort -V | tail -1)}"
if [ -z "$TAG" ]; then
  echo "check-apk-compat: no eva-apk-* tag found (fetch tags first)." >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORK" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# This checkout's backend, with the release's phone and shared code (what the APK bundles).
git worktree add -q --detach "$WORK" HEAD
git -C "$WORK" checkout -q "$TAG" -- apps/mobile packages/shared
(cd "$WORK" && pnpm install --frozen-lockfile=false --prefer-offline >/dev/null 2>&1)

if (cd "$WORK/apps/mobile" && npx tsc --noEmit -p . >"$WORK/tsc.log" 2>&1); then
  echo "check-apk-compat: $TAG works against this backend."
  exit 0
fi
echo "check-apk-compat: $TAG (installed on phones) breaks against this backend:" >&2
grep "error TS" "$WORK/tsc.log" >&2 || cat "$WORK/tsc.log" >&2
echo "Keep the old function or arguments working (an alias or optional field) until no supported APK calls them." >&2
exit 1
