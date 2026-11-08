#!/usr/bin/env bash
# Build a signed, sideloadable Eva Android release APK (arm64-v8a + x86_64,
# embedded JS) with Gradle, then write release.json next to it. No EAS.
#
#   VERSION_NAME=1.0.1 VERSION_CODE=1000 ./scripts/build-android-release.sh
#
# .github/workflows/release-android.yml chooses both values. Signing reads
# ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
# ANDROID_KEY_PASSWORD from the environment, else from keystore.properties in
# the repo root (gitignored); see apps/mobile/plugins/withReleaseSigning.js.
# The build stops if any is missing. It also needs EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
# EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_WEB_URL (EAS_PROJECT_ID is optional).
# Linux or WSL2 (GNU sed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
PACKAGE_ID="com.vis1.eva"
cd "$ROOT"

if ! [[ "${VERSION_NAME:-}" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Set VERSION_NAME to a version like 1.0.1." >&2
  exit 1
fi
# Android caps versionCode at 2100000000.
if ! [[ "${VERSION_CODE:-}" =~ ^[1-9][0-9]{0,9}$ ]] || [ "$VERSION_CODE" -gt 2100000000 ]; then
  echo "Set VERSION_CODE to a whole number from 1 to 2100000000, higher than every published release.json." >&2
  exit 1
fi
export VERSION_NAME VERSION_CODE

# Bake the production runtime config into the APK. Expo inlines EXPO_PUBLIC_*
# at bundle time. apps/mobile/src/config.ts has no defaults, so each value must
# come from the environment (the workflow passes them from repository
# variables). A release never ships without them.
for name in EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY EXPO_PUBLIC_CONVEX_URL EXPO_PUBLIC_WEB_URL; do
  if [ -z "${!name:-}" ]; then
    echo "$name is not set. Set it in the environment (see apps/mobile/RELEASE.md)." >&2
    exit 1
  fi
  export "$name"
done
# Optional: Expo project id for push tokens (see apps/mobile/README.md).
export EAS_PROJECT_ID="${EAS_PROJECT_ID:-}"

# Our own signing (EAS_BUILD would switch it off in Expo tooling).
unset EAS_BUILD || true
export CI="${CI:-1}"

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export PATH="$JAVA_HOME/bin:$PATH"

# cmdline-tools/latest, else the highest versioned cmdline-tools/<n.n> (an
# SDK may have only, say, cmdline-tools/16.0). Same rule as the workflow.
SDKMANAGER="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  SDKMANAGER=""
  while IFS= read -r dir; do
    dir="${dir%/}"
    if [[ "${dir##*/}" =~ ^[0-9]+(\.[0-9]+)*$ ]] && [ -x "$dir/bin/sdkmanager" ]; then
      SDKMANAGER="$dir/bin/sdkmanager"
    fi
  done < <(ls -d "$ANDROID_SDK_ROOT"/cmdline-tools/*/ 2>/dev/null | sort -V)
fi
if [ -z "$SDKMANAGER" ]; then
  echo "Android SDK cmdline-tools not found at $ANDROID_SDK_ROOT/cmdline-tools (latest or a version folder)" >&2
  exit 1
fi
export PATH="$(dirname "$SDKMANAGER"):$PATH"

# Mobile and its workspace deps (@eva/backend, @eva/shared), plus the root,
# whose pnpm settings (overrides, patches) the install uses.
pnpm install --frozen-lockfile --filter '@eva/mobile...' --filter '{.}'

cd "$MOBILE"
if [ "${SKIP_PREBUILD:-}" != "1" ]; then
  npx expo prebuild --platform android --clean --no-install
fi

# app.config.ts reads VERSION_CODE at prebuild time, so a SKIP_PREBUILD run
# keeps whatever android/ was generated with.
APP_GRADLE="$MOBILE/android/app/build.gradle"
if ! grep -qE "^[[:space:]]*versionCode ${VERSION_CODE}[[:space:]]*$" "$APP_GRADLE" ||
  ! grep -q "plugins/withReleaseSigning.js" "$APP_GRADLE"; then
  echo "android/ is stale (versionCode or signing). Run again without SKIP_PREBUILD=1." >&2
  exit 1
fi

PROPS="$MOBILE/android/gradle.properties"
# Prebuild can leave gradle.properties without a final newline, and GNU sed -i
# keeps it that way. An append then joins the last line
# ("...=36org.gradle.workers.max=2") and Gradle fails to parse it.
ensure_trailing_newline() {
  if [ -s "$1" ] && [ -n "$(tail -c 1 "$1")" ]; then
    printf '\n' >> "$1"
  fi
}
ensure_trailing_newline "$PROPS"
if grep -q '^reactNativeArchitectures=' "$PROPS"; then
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a,x86_64/' "$PROPS"
else
  ensure_trailing_newline "$PROPS"
  echo 'reactNativeArchitectures=arm64-v8a,x86_64' >> "$PROPS"
fi
if grep -q '^org.gradle.jvmargs=' "$PROPS"; then
  sed -i 's|^org.gradle.jvmargs=.*|org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m|' "$PROPS"
else
  ensure_trailing_newline "$PROPS"
  echo 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m' >> "$PROPS"
fi
if ! grep -q '^org.gradle.workers.max=' "$PROPS"; then
  ensure_trailing_newline "$PROPS"
  echo 'org.gradle.workers.max=2' >> "$PROPS"
fi
if ! grep -q '^android.lint.checkReleaseBuilds=' "$PROPS"; then
  ensure_trailing_newline "$PROPS"
  echo 'android.lint.checkReleaseBuilds=false' >> "$PROPS"
fi

printf 'sdk.dir=%s\n' "$ANDROID_SDK_ROOT" > "$MOBILE/android/local.properties"

OUT="$MOBILE/android/app/build/outputs/apk/release"
APK="$OUT/app-release.apk"
# A failed run must not leave an older APK or release.json to publish.
rm -f "$APK" "$OUT/release.json" "$OUT"/eva-*-android.apk

cd "$MOBILE/android"
chmod +x gradlew
# Vital lint is not needed for a sideload APK and can run out of Metaspace.
./gradlew assembleRelease --no-daemon -x lint -x lintVitalAnalyzeRelease -x lintVitalRelease

# Check the APK itself before describing it: package, versionCode,
# versionName, and a release signature rather than the debug key. aapt2 and
# apksigner come from the newest build-tools that has both.
BUILD_TOOLS=""
while IFS= read -r dir; do
  if [ -x "$dir/aapt2" ] && [ -x "$dir/apksigner" ]; then
    BUILD_TOOLS="$dir"
  fi
done < <(ls -d "$ANDROID_SDK_ROOT"/build-tools/*/ 2>/dev/null | sort -V)
if [ -z "$BUILD_TOOLS" ]; then
  echo "No build-tools with aapt2 and apksigner in $ANDROID_SDK_ROOT/build-tools. Install build-tools;36.0.0 with sdkmanager." >&2
  exit 1
fi
BADGING="$("$BUILD_TOOLS/aapt2" dump badging "$APK")"
badging_field() {
  sed -n "s/^package:.* $1='\([^']*\)'.*/\1/p" <<<"$BADGING"
}
BUILT="$(badging_field name) $(badging_field versionCode) $(badging_field versionName)"
if [ "$BUILT" != "$PACKAGE_ID $VERSION_CODE $VERSION_NAME" ]; then
  echo "Built $BUILT (package, versionCode, versionName); expected $PACKAGE_ID $VERSION_CODE $VERSION_NAME." >&2
  exit 1
fi
CERTS="$("$BUILD_TOOLS/apksigner" verify --print-certs "$APK")"
if grep -q "CN=Android Debug" <<<"$CERTS"; then
  echo "The APK is signed with the debug key. Not writing release.json." >&2
  exit 1
fi

NAME="eva-$VERSION_NAME-android.apk"
cp "$APK" "$OUT/$NAME"
# The workflow reads versionName and versionCode back from every published
# release.json to choose the next version.
SHA256="$(node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const [apk, manifest, versionName, versionCode] = process.argv.slice(1);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(apk)).digest("hex");
  const release = { versionName, versionCode: Number(versionCode), sha256 };
  fs.writeFileSync(manifest, JSON.stringify(release, null, 2) + "\n");
  process.stdout.write(sha256);
' "$OUT/$NAME" "$OUT/release.json" "$VERSION_NAME" "$VERSION_CODE")"

echo "Built $OUT/$NAME"
echo "  versionName $VERSION_NAME, versionCode $VERSION_CODE"
echo "  SHA-256 $SHA256"
echo "  Convex $EXPO_PUBLIC_CONVEX_URL"
echo "  Signing certificate SHA-256 $(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$CERTS")"
echo "Wrote $OUT/release.json"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "apk=$OUT/$NAME"
    echo "release_json=$OUT/release.json"
    echo "version_name=$VERSION_NAME"
    echo "version_code=$VERSION_CODE"
    echo "sha256=$SHA256"
  } >> "$GITHUB_OUTPUT"
fi
