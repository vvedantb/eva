# Changelog

## MCP data plane: Postgres SSRF guard, Convex deploy-key host check, Supabase bound to the repo project

Date: 2026-11-09

WHY: Repo env vars choose where Eva connects with secrets. A repo could point `POSTGRES_READ_REPLICA_URL` at loopback, private or cloud-metadata addresses, point its Convex URL at any host and receive the deploy key, or use a Supabase token to query any project in that Supabase account.

Architectural: `_mcp/postgresSsrfGuard.ts` gives pg a socket whose DNS lookup refuses blocked ranges (loopback, RFC1918, link-local, CGNAT, ULA, NAT64, multicast); the socket connects to the checked addresses, so there is no rebinding window. `customerConvexOrigin` in `_env/publicConvexUrls.ts` requires an https `*.convex.cloud` URL in `getRepoConvexCredentials`. Supabase tools now exist only in repo-scoped (sandbox) MCP sessions; `resolveSupabaseCredentials` reads the token and project ref from that repo only, `project_id` is forced to it, a different `project_id` is rejected, and `list_projects` plus tools without `project_id` (except `search_docs`) are hidden.
## Web: composer links look like chat links (underline + favicon), not chips

Date: 2026-11-09

WHY: Figma, GitHub, Linear, Sentry and PostHog links showed as accent pills with brand icons in the composer and in sent messages, while every other chat link used `MarkdownLink` (underline plus the site favicon). Two link styles for one thing.

Architectural: Removed `LinkChip`, `linkProviderIcons` and the label logic. `linkChipUtils` is now `linkUrls` and only detects the five hosts (kept so a hand-typed URL does not become a link after `https://x`). `MarkdownMentionText` and `MentionText` render `MarkdownLink`. The contenteditable composer writes the same `markdown-link` markup (favicon `img`, GitHub glyph, `<wbr>` breaks) and hides a failed favicon through `onErrorCapture`. The composer shows the full URL, not the shortened host + path label. `escapeHtml` now also escapes `"` for attribute safety.

## Mobile: native-ui 0.11.2 drops the typecheck auth shim

Date: 2026-11-09

WHY: `@vvedantb/native-ui@0.11.2` fixes the `prepareFirstFactor` typing (TS2322 under `strictFunctionTypes`) that #1136 worked around. Eva no longer needs a typecheck-only copy of the auth types.

Architectural: `apps/mobile` now depends on `^0.11.2`. Removed `typecheck/native-ui-auth.d.ts` and `tsconfig.typecheck.json`. The `typecheck` script runs `tsc -p tsconfig.json` against the real package. No runtime or behaviour change. The #1138 guards remain: `EnsureUser` timeout, Retry and Sign out, the rejection logger and its test, `test:hermes-apis`, and the Hermes-safe sorts in `packages/shared`.

## Mobile: native-ui 0.11.1 owns sign-in (second factor, first-factor codes, errors, PasswordInput)

Date: 2026-11-09

WHY: `@vvedantb/native-ui@0.11.1` ships what Eva carried as temporary local code or patches. `SignInScreen` handles `needs_second_factor`, `needs_client_trust`, `needs_new_password` and `needs_first_factor` (email_code and phone_code). `SecondFactorScreen` is exported from `@vvedantb/native-ui/auth`. `AuthScreen` uses `KeyboardAvoidingView` behavior `padding`. `attempt.status` is typed `string | null` upstream. The package also times out each Clerk stage through `stageTimeoutMs` (default 20000 ms), so Eva has no timeout shim. Two copies of the same flow are a maintenance cost.

Architectural: `apps/mobile` now depends on `^0.11.1` (only mobile declares it). Removed `patches/@vvedantb__native-ui@0.10.0.patch` and its `pnpm.patchedDependencies` entry. The temporary types-only 0.11.1 patch is dropped too: no Eva pnpm patch remains for native-ui, and the lockfile has no native-ui `patch_hash`. Mobile typecheck uses `tsconfig.typecheck.json` with a typecheck-only `paths` shim for `@vvedantb/native-ui/auth` so Eva does not fail on package `SignInScreen` TS2322 (`strictFunctionTypes` vs Clerk `PrepareFirstFactorParams`); Metro still bundles the real package. Delete the shim when native-ui types that signature correctly. The 0.9.0 keyboard patch was removed earlier in this PR, with `components/auth/SecondFactorScreen.tsx`, `src/auth/signInFlow.ts` and its tests, the `test:mfa` script and the `components/` entry in `tsconfig.json`. `app/(auth)/sign-in.tsx` is `SignInScreen` with Eva chrome only: `EvaMark` header, copy, Google scheme and path, `signUpHref`, `errorDisplay="inline"`. native-ui owns incomplete statuses, including first-factor email and phone codes. Sign-in errors follow #1134: one structured `console.error` per failure, "Invalid email or password" only for `form_password_incorrect` and `form_identifier_not_found`, and a friendly message with the Clerk code otherwise. The package `PasswordInput` adds a show/hide eye button. Eva has no local password toggle. The #1138 hang fix stays for `EnsureUser`, the rejection logger and the Hermes guard; its local sign-in flow, `test:mfa` and `testIDPrefix` are replaced by the package (second-factor screen id is the package default, `sign-in-second-factor-screen`).

## Mobile: log unhandled promise rejections in release builds

Date: 2026-11-09

WHY: RN release builds swallow unhandled rejections, so the 0.1.4 sign-in hang left no logcat error.

Architectural: `src/logging/unhandledRejections.ts` enables the Hermes rejection tracker and wraps the `ErrorUtils` global handler; both call `console.error("[uncaught]", ...)` with name, message and a short stack (no secrets). `_layout.tsx` installs it first. Sign-in submitters now catch, show "Couldn't sign you in." and log, then clear loading in `finally`. Code step uses `testIDPrefix="second-factor"` (screen id `second-factor-screen`). Missing factor ids and unsupported strategies now log. Test: `pnpm --filter @eva/mobile test:logging`.

## Mobile sign-in: endless spinner after a correct password (Hermes `toSorted`)

Date: 2026-11-09

WHY: In 0.1.4 the sign-in button spun without end after a correct password. Clerk answered in about 0.6 s with `needs_second_factor` (totp), but `codeFactors()` used `Array.prototype.toSorted`, which Hermes release builds can lack. The `TypeError` escaped `advance()` and `PasswordForm.submit` had no `finally`, so loading never cleared. In 0.1.3 the same throw showed as "Invalid email or password."

Architectural: `signInFlow.ts` sorts with `[...items].sort`; so do `packages/shared` `notificationGroups.ts` and `taskTags.ts` (mobile imports both). `advance()` catches everything (stage `nextStep`, message with `code: nextStep`). Every Clerk call and `setActive` has a 20 s limit (`SIGN_IN_STAGE_TIMEOUT_MS`), giving `Sign-in timed out at <stage> (code: timeout_<stage>)`. `logFailure` cannot throw. `PasswordForm`, `CodeStep` and `NewPasswordScreen` reset loading in `finally`. `EnsureUser` times out after 20 s, logs the failure and whether Convex auth ever became authenticated, and shows Retry and Sign out. Guard: `pnpm --filter @eva/mobile test:hermes-apis` fails if the mobile bundle or the shared modules it imports use `toSorted`, `toReversed`, `toSpliced`, `findLast`, `findLastIndex`, `.with(`, `.at(`, `Object.groupBy` or `Array.fromAsync`. Tests: `test:mfa` adds the totp flow, a run with `toSorted` deleted, and fake-timer timeouts.

## Mobile sign-in: stop masking real failures as "Invalid email or password."

Date: 2026-11-09

WHY: Any throw from `signIn.create()` or `setActive()` showed "Invalid email or password.", and Clerk messages that named the provider were dropped. Users saw a wrong-password message for captcha, network and session errors, and nobody could find the cause.

Architectural: `src/auth/signInFlow.ts` now parses Clerk errors with Zod and logs one structured `console.error` per failure (stage, error name, Clerk code, message, longMessage, paramName, status, trace id; never the password or code). `startSignIn` and `submitCode` separate `create`/`attempt*` failures from `setActive` failures. `failureMessage` replaces `clerkErrorMessage`: "Invalid email or password." only for `form_password_incorrect`, `form_identifier_not_found` and `form_param_format_invalid` on the identifier; other Clerk errors show their message plus `(code: ...)`; network errors and session failures have their own messages; other errors show a short reason.

## Mobile sign-in: Eva owns the password result (MFA, client trust, email code) and the Android keyboard

Date: 2026-11-09

WHY: Accounts with a second factor saw "needs another step. Finish it on the web." Native-ui 0.9.0 `SignInScreen` calls `signIn.create()` itself and shows that message for any status but `complete`, with no app callback, so Eva's `useSignIn().status` check never ran. On Android, the keyboard also covered the password field and Sign in button: `AuthScreen` used `KeyboardAvoidingView` behavior `height`, which does nothing when the window does not resize (Expo 57 edge-to-edge), and its `justify-center` kept the form centred on the full screen.

Architectural: `app/(auth)/sign-in.tsx` now builds the email and password form from native-ui pieces (`AuthScreen`, `Input`, `Button`, `FieldError`, `OrDivider`, `GoogleSignInButton`) and owns the `create()` result. `src/auth/signInFlow.ts` (replaces `totp.ts`) reads the resource status as a plain string, because Clerk's `SignInStatus` omits `needs_client_trust`, and returns one of four steps: complete, code (first or second factor: totp, backup_code, phone_code, email_code), new password, or unsupported. Finish-on-web shows only for unsupported states, with a `console.warn` of the status and strategy names. `SecondFactorScreen` stays free of Eva and Clerk imports and gains a resend timer, a method switcher and free-text codes. Keyboard: `patches/@vvedantb__native-ui@0.9.0.patch` sets `AuthScreen` to behavior `padding` on all platforms, so the scroll view shrinks above the keyboard (sign-in, sign-up and second factor). Both are self-contained so they can be dropped when native-ui ships the same. Tests: `pnpm --filter @eva/mobile test:mfa` (mocked `signIn`, every status and strategy).

## Mobile sign-in: TOTP second factor

Date: 2026-11-09

WHY: Eva's Clerk instance uses an authenticator app as the only second factor. Native-ui `SignInScreen` stops at `needs_second_factor` and shows "needs another step", so an account with TOTP on could not sign in on mobile.

Architectural: `app/(auth)/sign-in.tsx` keeps `SignInScreen` for the first factor and shows `components/auth/SecondFactorScreen` when `useSignIn().status` is `needs_second_factor`. `SecondFactorScreen` imports only react, react-native and native-ui, so it can move into native-ui unchanged. All Clerk logic (`attemptSecondFactor({ strategy: "totp" })`, `setActive`, error mapping) stays in `src/auth/totp.ts`, tested with a mocked `signIn` (`pnpm --filter @eva/mobile test:mfa`). Back uses the sign-in attempt id, not an effect, so a new attempt shows the code step again. `tsconfig.json` now includes `components/`.

## Fix Android blank screen on cold start (Clerk Native API off)

Date: 2026-11-09

WHY: Release APK eva-0.1.1 opened to a blank white screen. Clerk rejected the native client (`The Native API is disabled for this instance`), `ClerkLoaded` rendered nothing, and fonts returned `null` with no timeout. Nothing told the user what failed.

Architectural: `apps/mobile/app/_layout.tsx` now exports an expo-router `ErrorBoundary`, waits at most 3 s for fonts, and gates the app on `useAuth().isLoaded`. It also probes Clerk `/v1/environment` so a disabled Native API shows `StartupFailure` (native-ui `EmptyState`) with the real cause instead of a blank screen; a 15 s timeout covers other load failures. `scripts/check-clerk-native-api.sh` fails the release if `native_settings.api_enabled` is not true. Owner must enable Native applications in the Clerk Dashboard (see `apps/mobile/RELEASE.md`). Also removes a computed `ObjectPattern` in `usePresentationSync` that newly bailed out React Compiler on main.

## Fix Android release Metro bundle (missing Babel JSX plugin)

Date: 2026-11-08

WHY: `:app:createBundleReleaseJsAndAssets` failed with `Cannot find module '@babel/plugin-transform-react-jsx'`. `nativewind/babel` (via `react-native-css-interop`) names that plugin as a string, and Babel resolves it from `apps/mobile`. pnpm isolation did not link it there.

Architectural: `@babel/plugin-transform-react-jsx` is now a direct devDependency of `@eva/mobile`, so pnpm links it where Babel looks. The monorepo stays on the isolated linker.

## Fix main CI gate (lint / compiler / design)

Date: 2026-11-08

WHY: The required `typecheck / lint / compiler / design / schema` check was red on main (28 oxlint errors, 15 new stageshow React Compiler bailouts, design baseline drift), which blocked rebased PRs from going green.

Architectural: Real lint and try-block bailouts were fixed in place; stageshow motion modules that intentionally read refs during render opt out with `"use no memo"` instead of growing the compiler baseline; the design baseline was shrunk for fixed violations only (SVG mask white kept via a targeted ignore).
