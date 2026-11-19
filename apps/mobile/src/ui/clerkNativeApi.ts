import { z } from "zod";
import { PUBLISHABLE_KEY } from "@/config";

const clerkEnvironmentSchema = z.object({
  auth_config: z
    .object({
      native_settings: z
        .object({
          api_enabled: z.boolean(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * Clerk publishable keys encode `<frontend-api-host>$` as base64 after
 * `pk_live_` / `pk_test_`. Returns null if the key is not that shape.
 */
export function clerkFrontendApiHost(publishableKey: string = PUBLISHABLE_KEY): string | null {
  const match = /^pk_(?:live|test)_(.+)$/.exec(publishableKey);
  if (!match) return null;
  let body = match[1];
  while (body.length % 4 !== 0) body += "=";
  try {
    // atob is available in Hermes / React Native.
    const decoded = atob(body);
    const dollar = decoded.indexOf("$");
    const host = (dollar === -1 ? decoded : decoded.slice(0, dollar)).trim();
    if (!/^[A-Za-z0-9.-]+$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * True when Clerk's Native API is on for this publishable key. False when it
 * is off. Null when the host cannot be read or the request fails.
 */
export async function isClerkNativeApiEnabled(
  publishableKey: string = PUBLISHABLE_KEY,
): Promise<boolean | null> {
  const host = clerkFrontendApiHost(publishableKey);
  if (!host) return null;
  try {
    const response = await fetch(`https://${host}/v1/environment`);
    if (!response.ok) return null;
    const parsed = clerkEnvironmentSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const native = parsed.data.auth_config && parsed.data.auth_config.native_settings;
    if (!native) return null;
    return native.api_enabled;
  } catch {
    return null;
  }
}

export const NATIVE_API_DISABLED_MESSAGE =
  "The Native API is disabled for this Clerk instance. In the Clerk Dashboard, open Configure, Native applications, and turn it on for Eva. Then install a new APK.";
