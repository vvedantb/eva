import { requiredEnvUrl } from "@vvedantb/server";

/** Eva web app origin, no trailing slash. Throws when WEB_APP_URL is unset. */
export function getEvaBaseUrl(): string {
  return requiredEnvUrl("WEB_APP_URL");
}

/** Eva web app origin, no trailing slash, or null when WEB_APP_URL is unset. */
export function tryGetEvaBaseUrl(): string | null {
  const url = process.env.WEB_APP_URL;
  return url ? url.replace(/\/$/, "") : null;
}
