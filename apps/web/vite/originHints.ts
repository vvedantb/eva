import type { Plugin } from "vite";

const PLACEHOLDER = "<!-- origin-hints -->";

function stringEnv(
  env: Record<string, string>,
  key: string,
): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function clerkFrontendOrigin(publishableKey: string): string | undefined {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  if (encoded === publishableKey) return undefined;
  const host = Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/i.test(host)) return undefined;
  return `https://${host}`;
}

/**
 * Emits the Convex and Clerk resource hints from build-time env instead of
 * hardcoding them in `index.html`.
 *
 * Both hosts are per-deployment, so a checked-in literal goes stale the moment
 * a deployment moves — and a preconnect to an origin the page never contacts is
 * a wasted TLS handshake, not a no-op. Fonts stay hardcoded in `index.html`
 * because those origins are the same everywhere.
 */
export function originHints(): Plugin {
  let env: Record<string, string> = {};

  return {
    name: "eva-origin-hints",
    configResolved(config) {
      env = config.env;
    },
    transformIndexHtml(html) {
      if (!html.includes(PLACEHOLDER)) {
        throw new Error(
          `origin-hints: index.html is missing the "${PLACEHOLDER}" placeholder.`,
        );
      }

      const convexUrl = stringEnv(env, "VITE_CONVEX_URL");
      const clerkKey = stringEnv(env, "VITE_CLERK_PUBLISHABLE_KEY");
      const origins = [
        convexUrl === undefined ? undefined : originOf(convexUrl),
        clerkKey === undefined ? undefined : clerkFrontendOrigin(clerkKey),
      ].filter((origin): origin is string => origin !== undefined);

      const tags = origins
        .flatMap((origin) => [
          `<link rel="preconnect" href="${origin}" crossorigin />`,
          `<link rel="dns-prefetch" href="${origin}" />`,
        ])
        .join("\n    ");

      return html.replace(PLACEHOLDER, tags);
    },
  };
}
