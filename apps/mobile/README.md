# @eva/mobile

Android companion app for Eva. It tells you when an agent needs your input or someone mentions you, and lets you answer and reply from your phone. It is not a copy of the web app.

- Android only. Distribution is by sideloaded APK, as vmem does. The code is cross-platform; iOS needs a paid Apple developer account for installs and push.
- Expo SDK 57 (React Native 0.86), Expo Router, NativeWind, Clerk. UI from `@vvedantb/native-ui` 0.8: `/auth` (sign-in), `/tab-bar` (floating tabs), `/ai` (chat parts), `/layout`, `/primitives`, `/toast`.
- Data comes live from the same Convex deployment as the web app, through `api` from `@eva/backend`.

## What it does

| Screen | Data |
| --- | --- |
| Inbox | `notifications.list`. Tap opens the chat (`chatTarget`), or the web page for docs and comments. |
| Sessions | `mobile.listChats`: recent open sessions across every repo you can access. |
| Chat | `mobile.getChat`, `messages.listByParent`, `turns.getChatStatus`, `pendingQuestions.getActive`. Agent questions dock in place of the composer. Session chats reply with `sessionWorkflow.enqueueMessage`; quick tasks and projects are read-only, with "Open on web". |
| Settings | Account and sign out. Sign-out removes this phone's push token. |

Push (see `packages/backend/convex/push.ts`) goes out for:

- an agent's blocking question (`pendingQuestions.post`);
- `mention` and `routed_question` notifications (`createNotification`).

## Setup

1. Copy `.env.example` to `.env.local` and fill in the web app's Clerk publishable key, Convex URL and web origin.
2. `pnpm install` at the repository root.
3. `pnpm --filter @eva/mobile prebuild`, then `pnpm --filter @eva/mobile android` with a device or emulator connected. This needs JDK 17 and the Android SDK.

The app uses native modules (notifications, secure store), so Expo Go cannot run it. Use a debug build.

### Web preview (screenshots)

The sandbox has no emulator, so screens are checked in a browser build: `pnpm --filter @eva/mobile web:export` writes a static site (`web.output: "single"`), which any static server with an index.html fallback can serve. Push is off on web (`src/push/push.web.ts`): expo-notifications has no web version of `useLastNotificationResponse`.

### Push (one-time, owner only)

Push works only after these steps. Until then the app runs normally and does not register for push.

1. Create a Firebase project, add an Android app with package `com.vis1.eva`, and save `google-services.json` in this folder. It is picked up automatically.
2. Run `eas init` to create the Expo project, and set `EAS_PROJECT_ID` in `.env.local`.
3. Upload the FCM V1 service account key to Expo (`eas credentials`), so Expo's push service can send through FCM.

### Google sign-in

The redirect is `eva://sso-callback`. If Google sign-in fails with a redirect error, allow that URL in the Clerk dashboard (native applications). Email and password need no change.

### Release APK

`plugins/withReleaseSigning.js` signs `assembleRelease` with the keys in `keystore.properties` at the repository root (gitignored) or the `ANDROID_KEY*` environment variables. Debug builds need none.

## Changing the package name

`android.package` in `app.config.ts` can change at any time. Android treats a new package as a different app: install it fresh and sign in again. Its push token registers again on first launch.

## Not in v1

Starting sessions or tasks, replies to quick tasks and projects, markdown and tool steps in the transcript, terminal, diffs and PR review.
