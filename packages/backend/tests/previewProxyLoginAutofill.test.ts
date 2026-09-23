import { describe, expect, test } from "vitest";
import {
  buildPreviewProxyScript,
  healthBody,
} from "../convex/_sandbox_runtime/previewProxy";

/**
 * Vercel gives every sandbox its own `*.vercel.run` host and `vercel.run` is on
 * the Public Suffix List, so each preview is a separate registrable domain: the
 * browser's password manager never offers a password saved on another preview.
 * The proxy fills the app's sign-in form instead, from credentials saved once
 * per repo.
 *
 * The fill logic itself only means anything against a live DOM (it was verified
 * in a browser against a React-controlled two-step form); what is worth pinning
 * here is the wiring — credentials reaching the injected script, and a running
 * proxy being detected as stale when they change, since the script bakes them
 * in at launch and cannot reload them.
 */
const baseParams = {
  publicKeyJwk: null,
  sandboxId: "sbx-1",
  repoId: "repo-1",
  webAppUrl: "https://eva.test",
  inject: true,
} as const;

function fingerprintOf(script: string): string {
  const match = script.match(/const LOGIN_FINGERPRINT = "([^"]+)"/);
  if (!match?.[1]) throw new Error("no LOGIN_FINGERPRINT in generated script");
  return match[1];
}

describe("preview proxy login autofill", () => {
  test("injects the saved credentials into the page script", () => {
    const script = buildPreviewProxyScript({
      ...baseParams,
      login: { email: "dev@example.com", password: "hunter2" },
    });

    expect(script).toContain('const LOGIN_EMAIL = "dev@example.com"');
    expect(script).toContain('const LOGIN_PASSWORD = "hunter2"');
    // The fill script has to be part of what HTML responses carry.
    expect(script).toContain("loginAutofillScript");
    expect(script).toContain("installPreviewLoginAutofill");
  });

  test("stays inert when no credentials are saved", () => {
    const script = buildPreviewProxyScript(baseParams);

    expect(script).toContain('const LOGIN_EMAIL = ""');
    expect(script).toContain('const LOGIN_PASSWORD = ""');
    expect(fingerprintOf(script)).toBe("none");
  });

  test("fingerprints credentials so an edit relaunches the proxy", () => {
    const login = { email: "dev@example.com", password: "hunter2" };
    const script = buildPreviewProxyScript({ ...baseParams, login });

    // What the script answers /health with must be what the launcher expects,
    // or every preview open would relaunch the proxy (or never refresh it).
    expect(healthBody(3000, login)).toContain(fingerprintOf(script));
    expect(healthBody(3000, login)).toBe(healthBody(3000, { ...login }));
    expect(healthBody(3000, { ...login, password: "hunter3" })).not.toBe(
      healthBody(3000, login),
    );
    expect(healthBody(3000, null)).toContain("login=none");
  });
});
