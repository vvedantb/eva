"use node";

import { decryptValue, encryptValue } from "../encryption";

/** Decrypts one stored entry by key, or null when the key is missing. */
export function decryptStoredEntry(
  entries: Array<{ key: string; value: string }>,
  key: string,
): string | null {
  const entry = entries.find((item) => item.key === key);
  return entry ? decryptValue(entry.value) : null;
}

/** Decrypts a list of encrypted key/value pairs into a record. */
export function decryptCredentialMap(
  entries: Array<{ key: string; value: string }>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const entry of entries) {
    resolved[entry.key] = decryptValue(entry.value);
  }
  return resolved;
}

/** Encrypts plaintext credential pairs for storage. */
export function encryptCredentialEntries(
  entries: Array<{ key: string; value: string }>,
): Array<{ key: string; value: string }> {
  return entries.map((entry) => ({
    key: entry.key,
    value: encryptValue(entry.value),
  }));
}
