import { IconMail, IconKey } from "@tabler/icons-react";
import {
  PREVIEW_LOGIN_EMAIL_ENV,
  PREVIEW_LOGIN_PASSWORD_ENV,
} from "@eva/backend";
import type { EnvVarSlotEntry } from "./envVarSlotTypes";

/**
 * Sign-in credentials the preview proxy types into the app's own login form.
 *
 * Every sandbox preview lives on its own `*.vercel.run` host, and `vercel.run`
 * is on the Public Suffix List, so the browser treats each preview as an
 * unrelated site and never offers a password saved on a previous one. Saving
 * the login here once per repo makes every preview arrive pre-filled.
 *
 * Kept out of the sandbox env: only the proxy needs them, not the app process.
 */
export const PREVIEW_LOGIN_ENV_VARS: ReadonlyArray<EnvVarSlotEntry> = [
  {
    id: "preview-login-email",
    label: "Preview login email",
    primaryKey: PREVIEW_LOGIN_EMAIL_ENV,
    matchKeys: [PREVIEW_LOGIN_EMAIL_ENV],
    Logo: IconMail,
    hint: "Email/username Eva fills into this app's sign-in form on every preview.",
    placeholder: "you@example.com",
    multiline: false,
    sandboxExclude: true,
  },
  {
    id: "preview-login-password",
    label: "Preview login password",
    primaryKey: PREVIEW_LOGIN_PASSWORD_ENV,
    matchKeys: [PREVIEW_LOGIN_PASSWORD_ENV],
    Logo: IconKey,
    hint: "Password filled alongside it. Use a test account — never a personal or production login.",
    placeholder: "...",
    multiline: false,
    sandboxExclude: true,
  },
];
