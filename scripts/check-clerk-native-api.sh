#!/usr/bin/env bash
# Stop a release if Clerk's Native API is off for the instance in
# EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. With it off, the APK opens to a blank
# screen ("The Native API is disabled for this instance"). Fix: Clerk Dashboard,
# Configure, Native applications (see apps/mobile/RELEASE.md).
set -euo pipefail

key="${EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:-}"
if ! [[ "$key" =~ ^pk_(live|test)_(.+)$ ]]; then
  echo "::error::EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Clerk publishable key (pk_live_... or pk_test_...)."
  exit 1
fi

# The key body is base64 of "<frontend-api-host>$". Restore any stripped padding.
body="${BASH_REMATCH[2]}"
while [ $((${#body} % 4)) -ne 0 ]; do body="${body}="; done
host="$(printf '%s' "$body" | base64 -d 2>/dev/null || true)"
host="${host%\$}"
if ! [[ "$host" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "::error::Could not read the Clerk frontend API host from the publishable key."
  exit 1
fi

if ! env_json="$(curl -fsS --max-time 20 --retry 2 "https://$host/v1/environment")"; then
  echo "::error::Could not fetch https://$host/v1/environment. Re-run the release, or check the Clerk instance."
  exit 1
fi

enabled="$(printf '%s' "$env_json" | node -e '
  let raw = "";
  process.stdin.on("data", (chunk) => (raw += chunk));
  process.stdin.on("end", () => {
    const data = JSON.parse(raw);
    const native = data && data.auth_config && data.auth_config.native_settings;
    const value = native && typeof native.api_enabled === "boolean" ? String(native.api_enabled) : "missing";
    process.stdout.write(value);
  });
')"
if [ "$enabled" != "true" ]; then
  echo "::error::Clerk Native API is disabled for $host (native_settings.api_enabled=$enabled). The APK would open to a blank screen. Enable Configure, Native applications in the Clerk Dashboard for this instance, then re-run (see apps/mobile/RELEASE.md)."
  exit 1
fi
echo "Clerk Native API is enabled for $host."
