// Redline `compare` hooks for eva. See https://github.com/vvedantb/redline.
import { toInternalRepoHref } from "./src/lib/utils/repoUrl.ts";
import { createAgentSignInToken } from "./vite/agentSignInToken.ts";

const isHome = (url) => url.pathname.endsWith("/home");

/**
 * Signs the capture browser in as the agent user, the same way the dev-only
 * `/api/auth/agent-login` route does.
 */
export async function login({ page, baseUrl }) {
  // Both commits are served on 127.0.0.1, so the first sign-in's cookies
  // already cover the second. Signed out, /home redirects to the landing page.
  await page.goto(`${baseUrl}/home`, { waitUntil: "networkidle" });
  if (isHome(new URL(page.url()))) return;

  const result = await createAgentSignInToken(process.env);
  if (!result.ok) throw new Error(`${result.error} ${result.details ?? ""}`);
  await page.goto(
    `${baseUrl}/agent-callback?ticket=${encodeURIComponent(result.token)}`,
  );
  await page.waitForURL(isHome, { timeout: 30_000 });
}

/** Monorepo URLs `/owner/repo/app/…` match the route tree as `/owner/repo--app/…`. */
export const routePath = toInternalRepoHref;
