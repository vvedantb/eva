# Changelog

## Mobile sign-in: strategy-aware second factor

Date: 2026-11-09

WHY: The TOTP-only step covered Eva's Clerk instance today (`totp` is the only enabled second factor; backup codes off; no phone second factor; email is first-factor only). It would break the day an owner enables backup codes or an SMS or email second factor, and the sign-in would stop at "needs another step". The step now follows `signIn.supportedSecondFactors`.

Architectural: `src/auth/totp.ts` became `src/auth/secondFactor.ts`. `pickSecondFactor` parses the factor list with Zod and prefers `totp`, then Clerk's order (`backup_code`, `phone_code`, `email_code`); an empty list falls back to `totp`; `email_link` is skipped. `prepareSecondFactor` sends the SMS or email code (with `phoneNumberId` or `emailAddressId` from the factor); `submitSecondFactor` attempts the code and calls `setActive` on `complete`. Both return `{ ok } | { ok: false, error }`, never throw, and hide provider names. `useResendCooldown` (one 1 s timer effect) gives a 30 s Resend cooldown. `components/auth/SignInSecondFactor.tsx` holds the Clerk logic and sends the first code once per attempt in one effect (no user event starts it); `SecondFactorScreen` stays free of Clerk imports and gained `numeric`, `onResend` and `resendSeconds`. Tests: `pnpm --filter @eva/mobile test:mfa` (14 cases, mocked `signIn`).

Not handled: `needs_client_trust`. In `@clerk/clerk-expo` 2.20.2, `SignInStatus` is `needs_identifier | needs_first_factor | needs_second_factor | needs_new_password | complete`. The status does not exist in this version, so there is no handler. Add one after a clerk-expo upgrade adds it. A note sits beside the gate in `app/(auth)/sign-in.tsx`. `signIn.secondFactor` is not read; `supportedSecondFactors` is enough.

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
