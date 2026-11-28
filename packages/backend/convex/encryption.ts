"use node";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = "enc:";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Set it via: npx convex env set ENCRYPTION_KEY <64-char-hex-string>",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length} hex chars.`,
    );
  }
  return buf;
}

/** Encrypts a plaintext string using AES-256-GCM, returning a base64-encoded "enc:" prefixed string. */
export function encryptValue(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, encrypted, tag]);
  return PREFIX + payload.toString("base64");
}

/** Decrypts an "enc:" prefixed AES-256-GCM ciphertext back to plaintext. Passes through non-prefixed strings unchanged. */
export function decryptValue(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const key = getKey();
  const payload = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(payload.length - TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH, payload.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
