/**
 * HMAC-SHA256 as lowercase hex. Re-exported from `@vvedantb/server`, which runs
 * on WebCrypto, so signer and verifier share one implementation in both the
 * Convex isolate and Node actions.
 */
export { hmacSha256Hex } from "@vvedantb/server";
