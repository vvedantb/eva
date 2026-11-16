#!/usr/bin/env bash
# Build a signed, sideloadable Eva Android release APK (arm64-v8a + x86_64,
# embedded JS), then write release.json next to it. No EAS.
#
# Thin wrapper over the shared vvedantb-android-release bin, driven by
# scripts/android-release.config.json. The build logic lives in @vvedantb/config;
# the Clerk native-API check runs in the workflow pre_build_command.
#
# VERSION_NAME and VERSION_CODE come from the environment
# (.github/workflows/release-android.yml chooses both). Signing and the
# EXPO_PUBLIC_* runtime config also come from the environment. Linux CI only.
set -euo pipefail
# The reusable workflow does not install dependencies, and the bin below comes
# from @vvedantb/config, so install first.
pnpm install --frozen-lockfile --filter '@eva/mobile...' --filter '{.}'
exec pnpm exec vvedantb-android-release --config scripts/android-release.config.json
