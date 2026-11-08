# Releasing the Eva Android app

`.github/workflows/release-android.yml` builds a signed APK with `scripts/build-android-release.sh` and publishes it as a GitHub Release in this repository. The APK is for sideloading only. It is not on Google Play.

**Eva is not in V Store.** The release uses the tag prefix `eva-apk-`. V Store's catalog sync reads `mobile-apk-*` tags only, so it does not see these releases. This repository adds no V Store catalog entry.

The workflow is a thin caller of the shared workflow `vvedantb/packages/.github/workflows/release-android-apk.yml@main`, as vmem and Velth use. The shared workflow README ("Android APK release workflow") describes every input.

## When it runs

| Event | Result |
| --- | --- |
| Push to `main` that changes an APK input, with a `feat:` title or `[release]` in the message | Signed build, published with the next patch version. |
| Manual run (`workflow_dispatch`) | The same. Optional `version` input (like `0.1.1`). `dry_run: true` builds and signs, and uploads the APK as the Actions artifact `eva-android-dry-run`. It publishes nothing. |

Other pushes to `main` that touch APK inputs build nothing. The shared workflow default `release_on: feat` skips them. To release a fix, put `[release]` in the pull request title.

APK inputs (the `paths` filter) are the files Metro bundles: `apps/mobile/**` (not Markdown or `.env.example`), `packages/shared/**`, `packages/backend/index.ts`, `packages/backend/convex/**`, `packages/backend/package.json`, the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**` and `scripts/build-android-release.sh`. The backend folder is broad because `@eva/backend` re-exports runtime code from `convex/`. Keep the filter equal to the real import closure.

## Versions

- Tag: `eva-apk-<versionName>`. Assets: `eva-<versionName>-android.apk` and `release.json`. Title: `Eva <versionName>`.
- `versionName` is the `version` input. Without it, the workflow bumps the patch of the highest published `eva-apk-*` `release.json`. `DEFAULT_VERSION_NAME` in `app.config.ts` is the floor.
- `versionCode` is the highest published `versionCode` plus 1, with a floor of 1000.
- The release is not marked "latest", so other releases in this repository keep that flag.
- Notes come from `.github/android-release-notes.md` and the merged pull requests since the previous Eva release.

## GitHub secrets

Set these under Settings, Secrets and variables, Actions, Secrets. The run stops at "Decode signing keystore" if one is missing. It never falls back to the debug key.

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The PKCS12 sideload keystore, base64-encoded. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password. |
| `ANDROID_KEY_ALIAS` | The key alias in the keystore. |
| `ANDROID_KEY_PASSWORD` | The key password. |
| `BUILD_ENV_SECRETS` | Optional. `NAME=value` lines for secret build environment. Eva needs none today. |

Encode a keystore with `base64 -w0 release.p12` (Linux) or `base64 -i release.p12` (macOS). Do not commit keystores: `.gitignore` covers `*.jks`, `*.keystore` and `*.p12`.

Every release must use the same key. Android refuses an update signed with another key, and the user must uninstall first. Create a key for Eva. Do not reuse the vmem or V Store key without the owner's decision.

## GitHub variables

Set these under Settings, Secrets and variables, Actions, Variables. They are public values: Expo inlines them into the JavaScript bundle. They must match the web app's Clerk instance and Convex deployment.

| Variable | Required | Web equivalent |
| --- | --- | --- |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | `VITE_CLERK_PUBLISHABLE_KEY` |
| `EXPO_PUBLIC_CONVEX_URL` | Yes | `VITE_CONVEX_URL` |
| `EXPO_PUBLIC_WEB_URL` | Yes | The web app origin |
| `EAS_PROJECT_ID` | For push | The project id from `eas init` (see below) |

`apps/mobile/src/config.ts` has no production defaults. The workflow step `pre_build_command` and the build script both stop with a clear error if one of the three required values is empty. An empty `EAS_PROJECT_ID` is allowed: the app builds and does not register for push.

## Push in the release build

Push needs two owner steps, covered in the [README](README.md#push-one-time-owner-only):

1. `apps/mobile/google-services.json` for package `com.projectvdotuk.eva`, from the Velth Firebase project. Commit the real file once it exists. The build picks it up automatically (`app.config.ts`). This repository does not hold a placeholder, because a fake file would build an app that cannot get a push token.
2. `EAS_PROJECT_ID` as a repository variable (create the project first, see "Expo project" below), and the FCM V1 service account key uploaded to Expo.

Until both exist, the release APK works and shows no push.

## How the build signs

`plugins/withReleaseSigning.js` adds a `release` signing config to `android/app/build.gradle` at prebuild. It reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` from the environment, else from `keystore.properties` in the repository root (gitignored). A release task stops if one is missing.

The script runs `expo prebuild --platform android --clean`, then `./gradlew assembleRelease` for `arm64-v8a` and `x86_64`. It then checks the APK with `aapt2` (package, `versionCode`, `versionName`) and `apksigner` (not the debug key). Only then does it write `release.json`.

## Build locally

```sh
cat > keystore.properties <<'EOF'
ANDROID_KEYSTORE_PATH=/absolute/path/to/release.p12
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=...
ANDROID_KEY_PASSWORD=...
EOF
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=... EXPO_PUBLIC_CONVEX_URL=... EXPO_PUBLIC_WEB_URL=...
VERSION_NAME=0.1.1 VERSION_CODE=1000 ./scripts/build-android-release.sh
```

This needs Linux or WSL2, Java 21 and the Android SDK (`ANDROID_SDK_ROOT` or `ANDROID_HOME`). Set `SKIP_PREBUILD=1` to reuse `android/` when it was generated with the same `VERSION_CODE`.

## Expo project

`app.config.ts` sets `owner: "projectvdotuk"`, the Expo account that owns Velth and the other Project V apps. Create the project under that account:

```sh
cd apps/mobile
# Must be logged into Expo as a member of @projectvdotuk
# app.config.ts already has owner: "projectvdotuk", so the project is created under that account
npx eas-cli@latest init
```

Copy the printed project id into `EAS_PROJECT_ID` in `.env.local` and set it as the `EAS_PROJECT_ID` repository variable. Do not commit the id or add it to `eas.json`.
