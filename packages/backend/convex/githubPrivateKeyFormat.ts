import { base64ToBytes, bytesToBase64 } from "@vvedantb/server";

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 128) {
    return new Uint8Array([length]);
  }
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function encodeDerTag(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes([
    new Uint8Array([tag]),
    encodeDerLength(content.length),
    content,
  ]);
}

function encodeDerSequence(children: Uint8Array[]): Uint8Array {
  return encodeDerTag(0x30, concatBytes(children));
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  return base64ToBytes(base64);
}

function wrapBase64Lines(base64: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }
  return lines;
}

function derToPem(der: Uint8Array, label: string): string {
  const lines = wrapBase64Lines(bytesToBase64(der));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function wrapPkcs1DerInPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const rsaEncryptionOid = encodeDerTag(
    0x06,
    new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
  );
  const algorithmIdentifier = encodeDerSequence([
    rsaEncryptionOid,
    encodeDerTag(0x05, new Uint8Array([])),
  ]);
  return encodeDerSequence([
    encodeDerTag(0x02, new Uint8Array([0])),
    algorithmIdentifier,
    encodeDerTag(0x04, pkcs1Der),
  ]);
}

export function normalizePemKey(raw: string): string {
  const cleaned = raw.replace(/\\n/g, "\n").replace(/\\+$/gm, "").trim();
  if (cleaned.includes("\n")) return cleaned;

  const base64 = cleaned
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s/g, "");

  const isRsa = cleaned.includes("RSA PRIVATE KEY");
  const header = isRsa
    ? "-----BEGIN RSA PRIVATE KEY-----"
    : "-----BEGIN PRIVATE KEY-----";
  const footer = isRsa
    ? "-----END RSA PRIVATE KEY-----"
    : "-----END PRIVATE KEY-----";
  const lines = [header, ...wrapBase64Lines(base64), footer];
  return lines.join("\n");
}

export function ensurePkcs8PrivateKey(pem: string): string {
  if (!pem.includes("RSA PRIVATE KEY")) {
    return pem;
  }
  const pkcs1Der = pemToDer(pem);
  const pkcs8Der = wrapPkcs1DerInPkcs8(pkcs1Der);
  return derToPem(pkcs8Der, "PRIVATE KEY");
}
