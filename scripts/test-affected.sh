#!/usr/bin/env bash
# Runs one package's bun tests: `scripts/test-affected.sh <package> [upstream...]`.
#
# On a pull request the shared CI workflow sets VV_TEST_CHANGED to
# `--changed=origin/<base>` (it is empty for a full run, and the workflow
# already forces a full run for config, lockfile and similar changes). Bun's
# --changed follows relative imports but not workspace packages, so a diff in
# an upstream package still runs the whole suite. test-timings.json makes the
# parallel workers start the slowest files first.
set -euo pipefail

pkg=$1
shift
args=(--parallel --timings=test-timings.json)

if [ -n "${VV_TEST_CHANGED:-}" ]; then
  base=$(git merge-base "${VV_TEST_CHANGED#--changed=}" HEAD)
  if git diff --quiet "$base" -- "$@" "$pkg/bunfig.toml"; then
    args+=("--changed=$base")
  else
    echo "$pkg: an upstream package or test setup changed, so every test runs."
  fi
fi

cd "$pkg"
exec bun test "${args[@]}"
