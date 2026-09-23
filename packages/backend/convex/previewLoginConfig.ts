/**
 * Credentials the preview proxy autofills into an app's sign-in form.
 *
 * Vercel hands every sandbox its own `*.vercel.run` host, and `vercel.run` is
 * on the Public Suffix List, so each preview is a separate registrable domain:
 * browser password managers never offer a password saved on another preview.
 * Eva fills the form itself instead — one saved value per repo, injected by the
 * in-sandbox preview proxy.
 *
 * Stored as ordinary env vars (already encrypted at rest, already have a
 * settings UI) but kept out of the sandbox process env by default, so the
 * password only ever reaches the proxy script.
 */
export const PREVIEW_LOGIN_EMAIL_ENV = "EVA_PREVIEW_LOGIN_EMAIL";
export const PREVIEW_LOGIN_PASSWORD_ENV = "EVA_PREVIEW_LOGIN_PASSWORD";

export interface PreviewLoginCredentials {
  email: string;
  password: string;
}
