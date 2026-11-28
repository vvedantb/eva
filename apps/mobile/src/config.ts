function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy apps/mobile/.env.example to .env.local.`);
  return value;
}

export const PUBLISHABLE_KEY = required(
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
);
export const CONVEX_URL = required("EXPO_PUBLIC_CONVEX_URL", process.env.EXPO_PUBLIC_CONVEX_URL);
export const WEB_URL = required("EXPO_PUBLIC_WEB_URL", process.env.EXPO_PUBLIC_WEB_URL).replace(/\/$/, "");

/** Google sign-in redirect: `eva://sso-callback`. */
export const SSO_SCHEME = "eva";
export const SSO_PATH = "sso-callback";
