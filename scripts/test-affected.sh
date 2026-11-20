#!/usr/bin/env bash
# Runs one package's bun tests: `scripts/test-affected.sh <package> [upstream...]`.
#
# With TEST_BASE_REF set (a pull request) it runs only the test files the diff can
# reach (bun test --changed). Bun follows relative imports but not workspace
# packages, so a diff in an upstream package or in root install config runs
# the whole suite instead. test-timings.json balances the parallel workers.
set -euo pipefail

pkg=$1
shift
args=(--parallel --timings=test-timings.json)

if [ -n "${TEST_BASE_REF:-}" ]; then
  base=$(git merge-base "$TEST_BASE_REF" HEAD)
  if git diff --quiet "$base" -- "$@" package.json pnpm-lock.yaml \
    pnpm-workspace.yaml patches "$pkg/package.json" "$pkg/bunfig.toml"; then
    args+=("--changed=$base")
  else
    echo "$pkg: upstream or install config changed, so every test runs."
  fi
fi

cd "$pkg"
exec bun test "${args[@]}"
