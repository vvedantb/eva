import { afterEach, describe, expect, test, vi } from "vitest";
import { toProxiedPreviewHost, toSandboxHost } from "@eva/shared/previewHost";
import worker from "../../../apps/preview-proxy/src/worker";
import {
  isPreviewReturnHost,
  toPublicPreviewUrl,
} from "../convex/previewProxyDomain";

/**
 * `vercel.run` is a public suffix, so the browser's password manager treats
 * every sandbox preview as a new site. Previews are instead served as
 * `<label>-<sig>.<domain>` through a Cloudflare Worker; these pin that Convex
 * (minting) and the Worker (verifying) agree, and that the Worker only ever
 * serves hosts Eva signed.
 */
const DOMAIN = "previews.example";
const SECRET = "test-secret";
const env = { PREVIEW_PROXY_DOMAIN: DOMAIN, PREVIEW_PROXY_SECRET: SECRET };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("preview host signing", () => {
  test("round-trips a sandbox host through the proxy domain", async () => {
    const proxied = await toProxiedPreviewHost(
      "sbx-abc123-3000.vercel.run",
      DOMAIN,
      SECRET,
    );
    expect(proxied).toMatch(
      /^sbx-abc123-3000-[0-9a-f]{16}\.previews\.example$/,
    );
    expect(await toSandboxHost(proxied ?? "", DOMAIN, SECRET)).toBe(
      "sbx-abc123-3000.vercel.run",
    );
  });

  test("rejects forged, foreign and nested hosts", async () => {
    const proxied =
      (await toProxiedPreviewHost("sbx-1-3000.vercel.run", DOMAIN, SECRET)) ??
      "";
    const forged = proxied.replace(/[0-9a-f](?=\.)/, (c) =>
      c === "0" ? "1" : "0",
    );
    expect(await toSandboxHost(forged, DOMAIN, SECRET)).toBeNull();
    expect(await toSandboxHost(proxied, DOMAIN, "other-secret")).toBeNull();
    expect(
      await toSandboxHost(proxied, "elsewhere.example", SECRET),
    ).toBeNull();
    expect(await toSandboxHost(`a.${proxied}`, DOMAIN, SECRET)).toBeNull();
    expect(await toSandboxHost(DOMAIN, DOMAIN, SECRET)).toBeNull();
  });

  test("leaves hosts it cannot map alone", async () => {
    expect(
      await toProxiedPreviewHost("example.com", DOMAIN, SECRET),
    ).toBeNull();
    // A signed label longer than 63 chars is not a valid DNS label.
    expect(
      await toProxiedPreviewHost(
        `${"a".repeat(50)}.vercel.run`,
        DOMAIN,
        SECRET,
      ),
    ).toBeNull();
  });
});

describe("Convex side", () => {
  test("keeps vercel.run URLs when the proxy domain is not configured", async () => {
    const url = new URL("https://sbx-1-3000.vercel.run/app?x=1");
    expect((await toPublicPreviewUrl(url)).toString()).toBe(url.toString());
    expect(await isPreviewReturnHost("sbx-1-3000.vercel.run")).toBe(true);
    expect(await isPreviewReturnHost("evil.example")).toBe(false);
  });

  test("moves preview URLs onto the proxy domain and trusts only signed returns", async () => {
    vi.stubEnv("PREVIEW_PROXY_DOMAIN", DOMAIN);
    vi.stubEnv("PREVIEW_PROXY_SECRET", SECRET);
    const url = await toPublicPreviewUrl(
      new URL("https://sbx-1-3000.vercel.run/app?x=1#top"),
    );
    expect(url.hostname.endsWith(`.${DOMAIN}`)).toBe(true);
    expect(url.pathname + url.search + url.hash).toBe("/app?x=1#top");
    expect(await isPreviewReturnHost(url.hostname)).toBe(true);
    expect(
      await isPreviewReturnHost(`sbx-1-3000-0000000000000000.${DOMAIN}`),
    ).toBe(false);
  });
});

describe("Worker", () => {
  test("pipes signed hosts to their sandbox and keeps redirects on our domain", async () => {
    const proxied =
      (await toProxiedPreviewHost("sbx-1-3000.vercel.run", DOMAIN, SECRET)) ??
      "";
    const upstream = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://sbx-1-3000.vercel.run/login?next=%2F");
      expect(request.method).toBe("POST");
      expect(request.headers.get("cookie")).toBe("__eva_preview_session=s");
      return new Response(null, {
        status: 302,
        headers: { location: "https://sbx-1-3000.vercel.run/home" },
      });
    });
    vi.stubGlobal("fetch", upstream);

    const response = await worker.fetch(
      new Request(`https://${proxied}/login?next=%2F`, {
        method: "POST",
        headers: { cookie: "__eva_preview_session=s" },
        body: "email=a",
      }),
      env,
    );
    expect(upstream).toHaveBeenCalledOnce();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://${proxied}/home`);
  });

  test("never redirects to a different sandbox host", async () => {
    const proxied =
      (await toProxiedPreviewHost("sbx-1-3000.vercel.run", DOMAIN, SECRET)) ??
      "";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://sbx-2-3000.vercel.run/" },
          }),
      ),
    );
    const response = await worker.fetch(
      new Request(`https://${proxied}/`),
      env,
    );
    expect(response.headers.get("location")).toBe(
      "https://sbx-2-3000.vercel.run/",
    );
  });

  test("refuses unsigned hosts without touching upstream", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(
      new Request(`https://sbx-1-3000-0000000000000000.${DOMAIN}/`),
      env,
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
