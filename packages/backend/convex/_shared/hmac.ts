import { bytesToHex } from "@vvedantb/server";

/**
 * HMAC-SHA256 as lowercase hex via WebCrypto, which both the Convex isolate
 * and Node actions provide, so signer and verifier share one implementation.
 */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}
