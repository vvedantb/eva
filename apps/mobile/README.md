# @eva/mobile

Android companion app for Eva. It tells you when an agent needs your input or someone mentions you, and lets you answer and reply from your phone. It is not a copy of the web app.

- Android only. Distribution is by sideloaded APK from GitHub Releases (see [RELEASE.md](RELEASE.md)). Eva is not in V Store. The code is cross-platform; iOS needs a paid Apple developer account for installs and push.
- Expo SDK 57 (React Native 0.86), Expo Router, NativeWind, Clerk. UI from `@vvedantb/native-ui` (pinned to a git commit, see below): `/auth` (sign-in), `/tab-bar` (floating tabs), `/ai` (chat parts), `/layout`, `/primitives`, `/toast`.
- Data comes live from the same Convex deployment as the web app, through `api` from `@eva/backend`.

## What it does

| Screen | Data |
| --- | --- |
| Inbox | `notifications.list`. Tap opens the chat (`chatTarget`), or the web page for docs and comments. |
| Sessions | `mobile.listChats`: recent open sessions across every repo you can access. A help-circle marks a session waiting on your answer. |
| Quick tasks | `mobile.listQuickTasks`: quick tasks (no project) across every repo you can access, list view only, with Active and Done tabs. The row checkbox completes a task (`agentTasks.updateStatus`). `+` opens `/task/new` (`agentTasks.createQuickTask`, then `startExecution`). Tap opens the chat. |
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

Eva uses the same push path as Velth: the app asks Expo for a push token, Convex sends through the Expo push service (`packages/backend/convex/push.ts`), and Expo delivers through Firebase Cloud Messaging (FCM) v1. Convex does not call FCM directly.

1. Use the **Velth Firebase project**. Do not create a new one. In its console, add an Android app with package `com.projectvdotuk.eva` and download `google-services.json`.
2. Save the file as `apps/mobile/google-services.json`. `app.config.ts` picks it up when it exists. Commit it once it is the real file for `com.projectvdotuk.eva`, as Velth does. It holds no secret: it has the public client keys only. This repository does not hold a placeholder, because a fake file builds an app that cannot get a token.
3. Create the Expo project under the `projectvdotuk` account (the same account as Velth). `app.config.ts` already sets `owner: "projectvdotuk"`, so the project is created there. Log in to Expo as a member of `@projectvdotuk`, then run:

   ```sh
   cd apps/mobile
   npx eas-cli@latest init
   ```

   Copy the printed project id into `EAS_PROJECT_ID` in `.env.local` for local builds, and set it as the `EAS_PROJECT_ID` repository variable for release builds. Do not commit the id.
4. Create a service account key for the Velth Firebase project (Project settings, Service accounts) and upload it to Expo with `eas credentials` (Android, the Google Service Account Key for Push Notifications, FCM V1). Expo then sends through FCM for `com.projectvdotuk.eva`. Do not commit the service account key.

Without `google-services.json`, `getExpoPushTokenAsync` fails and the app skips registration. Without `EAS_PROJECT_ID`, it skips registration before that call.

### Google sign-in

The redirect is `eva://sso-callback`. If Google sign-in fails with a redirect error, allow that URL in the Clerk dashboard (native applications). Email and password need no change.

### Release APK

`plugins/withReleaseSigning.js` signs `assembleRelease` with the keys in `keystore.properties` at the repository root (gitignored) or the `ANDROID_KEY*` environment variables. Debug builds need none.

GitHub Actions builds and publishes the signed APK. See [RELEASE.md](RELEASE.md) for the secrets, the variables, the tag prefix (`eva-apk-`) and how to build locally.

### UI kit pin

`@vvedantb/native-ui` is pinned to a git commit in `package.json`. npm 0.8.0 (the latest published on 8 November 2026) does not export what the app uses: `DropdownMenu*`, `ChoiceQuestion`, `AgentTraceFold`, `MessageMeta`, `ActivityStepDetail`, `DividedList`, `BulkActionBar`, `configureTheme`, `/markdown`, and newer `PromptInput` and `MessageContent` props. Typecheck fails with 27 errors against 0.8.0. Move to an npm version when one ships these.

## Changing the package name

`android.package` in `app.config.ts` can change at any time. Android treats a new package as a different app: install it fresh and sign in again. Its push token registers again on first launch.

## Not in v1

Starting sessions or tasks, replies to quick tasks and projects, terminal, diffs and PR review.
