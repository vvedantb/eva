import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { exportJWK, generateKeyPair } from "jose";
import { signPreviewGrant } from "../convex/previewGrant";
import {
  PREVIEW_GRANT_AUDIENCE,
  PREVIEW_GRANT_ISSUER,
} from "../convex/previewGrantConfig";
import { extractFunctionSource } from "./_helpers/previewProxySource";

const verifyGrantSource = extractFunctionSource("function verifyGrant(token) {");
const b64urlToBufSource = extractFunctionSource("function b64urlToBuf(s) {");

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  process.env.PREVIEW_GRANT_PRIVATE_KEY = JSON.stringify(
    await exportJWK(privateKey),
  );
  const publicPem = crypto.KeyObject.from(publicKey).export({
    type: "spki",
    format: "pem",
  });
  const factory = new Function(
    "crypto",
    "Buffer",
    `const PUBLIC_KEY = crypto.createPublicKey(${JSON.stringify(publicPem)});
const EXPECTED_ISS = ${JSON.stringify(PREVIEW_GRANT_ISSUER)};
const EXPECTED_AUD = ${JSON.stringify(PREVIEW_GRANT_AUDIENCE)};
const SANDBOX_ID = "sb";
const AUTH_PORT = 3000;
${b64urlToBufSource}
${verifyGrantSource}
return verifyGrant;`,
  );
  const verifyGrant: (token: string) => { sub: string } | null = factory(
    crypto,
    Buffer,
  );
  return verifyGrant;
}

describe("previewProxy verifyGrant checks the port claim", () => {
  test("accepts a grant for its own port", async () => {
    const verifyGrant = await setup();
    const grant = await signPreviewGrant({ sandboxId: "sb", port: 3000, sub: "u" });
    expect(verifyGrant(grant)?.sub).toBe("u");
  });

  test("rejects a grant for another port", async () => {
    const verifyGrant = await setup();
    const zero = await signPreviewGrant({ sandboxId: "sb", port: 0, sub: "u" });
    const desktop = await signPreviewGrant({ sandboxId: "sb", port: 6080, sub: "u" });
    expect(verifyGrant(zero)).toBeNull();
    expect(verifyGrant(desktop)).toBeNull();
  });
});
